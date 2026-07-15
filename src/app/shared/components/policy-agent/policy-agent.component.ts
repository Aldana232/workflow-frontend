import { Component, OnInit, ViewChild, ElementRef, inject, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TimeoutError } from 'rxjs';
import { timeout } from 'rxjs/operators';
import { AnalyticsService } from '../../../core/services/analytics';
import { ProcessService } from '../../../core/services/process';
import { SpeechService } from '../../../core/services/speech';
import { LucideBot, LucideMic, LucideTriangleAlert, LucideSend } from '@lucide/angular';

interface ChatMsg {
  id: number;
  role: 'user' | 'agent';
  text: string;
  processName?: string;
  confidence?: number;
  reason?: string;
}

const COMPANY_ID = 'saguapac';

const AFFIRMATIVE = ['si', 'sí', 'claro', 'ok', 'quiero', 'deseo', 'adelante', 'cómo', 'como', 'cuéntame', 'ayuda', 'procede'];
const NEGATIVE    = ['no', 'cancelar', 'otro', 'otra', 'diferente', 'buscar', 'nada'];

@Component({
  selector: 'app-policy-agent',
  standalone: true,
  imports: [CommonModule, FormsModule, LucideBot, LucideMic, LucideTriangleAlert, LucideSend],
  templateUrl: './policy-agent.component.html',
  styleUrl: './policy-agent.component.css',
})
export class PolicyAgentComponent implements OnInit {
  private analytics = inject(AnalyticsService);
  private procSvc   = inject(ProcessService);
  private speech    = inject(SpeechService);
  private cdr       = inject(ChangeDetectorRef);

  @ViewChild('chatBody') chatBodyRef!: ElementRef<HTMLDivElement>;

  messages: ChatMsg[] = [];
  inputText   = '';
  isThinking  = false;
  isListening = false;
  voiceError  = '';

  // Estado del agente
  private nextId                  = 0;
  private isVoiceMode             = false;
  private awaitingConfirmation    = false;
  private lastRecommendedProcess  = '';

  ngOnInit(): void {
    this.push('agent',
      'Hola, soy el Agente Saguapac. Descríbeme tu necesidad y analizaré qué trámite es el más adecuado para ti.'
    );
  }

  // ── Envío de mensaje ────────────────────────────────────────────────────────

  sendMessage(): void {
    const text = this.inputText.trim();
    if (!text || this.isThinking) return;

    this.push('user', text);
    this.inputText  = '';
    this.isThinking = true;
    this.scroll();
    this.cdr.detectChanges();

    // El agente detecta intención de contexto antes de llamar a la API
    if (this.awaitingConfirmation && this.lastRecommendedProcess) {
      const lower = text.toLowerCase();
      if (AFFIRMATIVE.some(w => lower.includes(w))) {
        this.handleAffirmativeIntent();
        return;
      }
      if (NEGATIVE.some(w => lower.includes(w))) {
        this.handleNegativeIntent();
        return;
      }
    }

    // Consulta nueva → llamar al microservicio de recomendación
    this.awaitingConfirmation = false;
    this.analytics.recommendPolicy(text, COMPANY_ID).pipe(timeout(30_000)).subscribe({
      next: (result: any) => {
        if (result?.error || result?.status === 'insufficient_data') {
          const msg = result?.message
            ?? 'No encontré un trámite que coincida. Intenta ser más específico, por ejemplo: "solicitar conexión de agua", "reclamo por corte de servicio" o "pago de factura".';
          this.push('agent', msg);
          this.isThinking = false;
          this.cdr.detectChanges();
          this.scroll();
          this.speech.speak(msg, () => { if (this.isVoiceMode) this.listenVoice(); });
          return;
        }

        const processName = result?.processName;
        const pid         = result?.recommendedProcess;

        if (processName) {
          this.addResult(result, processName);
        } else if (pid && typeof pid === 'string' && pid.length === 24) {
          this.procSvc.getById(pid).subscribe({
            next:  (proc: any) => this.addResult(result, proc?.name ?? pid),
            error: ()          => this.addResult(result, pid),
          });
        } else {
          this.addResult(result, pid ?? '—');
        }
      },
      error: (err: any) => {
        const isTimeout = err instanceof TimeoutError;
        const msg = isTimeout
          ? 'El servicio de IA tardó demasiado. Intenta nuevamente en unos momentos.'
          : 'No pude procesar tu consulta en este momento. Intenta nuevamente.';
        this.push('agent', msg);
        this.isThinking = false;
        this.cdr.detectChanges();
        this.scroll();
        this.speech.speak(msg, () => { if (this.isVoiceMode) this.listenVoice(); });
      },
    });
  }

  // ── Resultado de recomendación ──────────────────────────────────────────────

  private addResult(result: any, processName: string): void {
    const confidence = Math.round((result?.confidence ?? 0) * 100);
    const reason     = result?.reason ?? '';

    this.messages.push({ id: this.nextId++, role: 'agent', text: '', processName, confidence, reason });
    this.isThinking              = false;
    this.lastRecommendedProcess  = processName;
    this.cdr.detectChanges();
    this.scroll();

    // Seguimiento de agente: preguntar si quiere iniciar el trámite
    setTimeout(() => {
      const followUp = `¿Quieres que te explique cómo iniciar el trámite de "${processName}"? Puedes responder "sí" o describirme otra necesidad.`;
      this.push('agent', followUp);
      this.awaitingConfirmation = true;
      this.cdr.detectChanges();
      this.scroll();

      this.speech.speak(
        `Te recomiendo el trámite ${processName}, con una confianza del ${confidence} por ciento. ¿Quieres que te explique cómo iniciarlo?`,
        () => { if (this.isVoiceMode) this.listenVoice(); }
      );
    }, 700);
  }

  // ── Intenciones de agente ───────────────────────────────────────────────────

  private handleAffirmativeIntent(): void {
    const proc = this.lastRecommendedProcess;
    const guide =
      `Para iniciar el trámite "${proc}" sigue estos pasos:\n\n` +
      `1. Inicia sesión en el portal de Saguapac.\n` +
      `2. Selecciona "Nuevo trámite".\n` +
      `3. Elige el proceso "${proc}".\n` +
      `4. Completa el formulario y adjunta los documentos requeridos.\n\n` +
      `¿Tienes alguna duda sobre algún paso?`;

    this.push('agent', guide);
    this.isThinking = false;
    this.awaitingConfirmation = false;
    this.cdr.detectChanges();
    this.scroll();

    this.speech.speak(
      `Para iniciar el trámite ${proc}, inicia sesión en el portal, selecciona Nuevo trámite y sigue el formulario. ¿Tienes alguna duda?`,
      () => { if (this.isVoiceMode) this.listenVoice(); }
    );
  }

  private handleNegativeIntent(): void {
    const msg = 'Entendido. Descríbeme otra necesidad y encontraré el trámite más adecuado para ti.';
    this.push('agent', msg);
    this.isThinking = false;
    this.awaitingConfirmation = false;
    this.cdr.detectChanges();
    this.scroll();
    this.speech.speak(msg, () => { if (this.isVoiceMode) this.listenVoice(); });
  }

  // ── Voz ────────────────────────────────────────────────────────────────────

  listenVoice(): void {
    if (this.isListening) return;
    this.speech.stopSpeaking();
    this.isVoiceMode = true;
    this.isListening = true;
    this.voiceError  = '';
    this.cdr.detectChanges();

    this.speech.listen().subscribe({
      next: (text: string) => {
        this.inputText = text;
        this.cdr.detectChanges();
      },
      error: (err: Error) => {
        this.voiceError  = err.message;
        this.isListening = false;
        this.cdr.detectChanges();
      },
      complete: () => {
        this.isListening = false;
        // Auto-enviar cuando el reconocimiento termina en modo voz
        if (this.isVoiceMode && this.inputText.trim()) {
          setTimeout(() => this.sendMessage(), 200);
        }
        this.cdr.detectChanges();
      },
    });
  }

  // ── Utilidades ──────────────────────────────────────────────────────────────

  onKeydown(e: KeyboardEvent): void {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      this.isVoiceMode = false; // teclado desactiva modo voz
      this.sendMessage();
    }
  }

  private push(role: 'user' | 'agent', text: string): void {
    this.messages.push({ id: this.nextId++, role, text });
  }

  private scroll(): void {
    setTimeout(() => {
      const el = this.chatBodyRef?.nativeElement;
      if (el) el.scrollTop = el.scrollHeight;
    }, 60);
  }
}
