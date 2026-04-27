import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { environment } from '../../../environments/environment';
import { SpeechService } from './speech';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

/** Returned by validateField — valid:false means a local rule failed. */
export interface FieldValidationResult {
  valid: boolean;
  suggestion?: string;
  /** Valor ya corregido — el componente debe parcharlo en el control sin disparar eventos. */
  correctedValue?: string;
}

@Injectable({ providedIn: 'root' })
export class AssistantService {
  private http   = inject(HttpClient);
  private speech = inject(SpeechService);
  private base   = environment.apiUrl;

  // ── Chat ──────────────────────────────────────────────────────────────────

  /** Sends a question to the backend assistant and returns the text answer. */
  ask(question: string, tramiteId: string, nodeId?: string | null): Observable<string> {
    const body: Record<string, string> = { question, tramiteId };
    if (nodeId) body['nodeId'] = nodeId;
    return this.http
      .post<{ data: string; success: boolean; error?: string }>(
        `${this.base}/assistant/ask`, body
      )
      .pipe(map(r => r.data ?? 'Sin respuesta del asistente.'));
  }

  /**
   * Like ask(), but also reads the answer aloud via TTS after receiving it.
   * Use this when the question came from a microphone input.
   */
  askWithSpeech(question: string, tramiteId: string, nodeId?: string | null): Observable<string> {
    return this.ask(question, tramiteId, nodeId).pipe(
      map(answer => {
        this.speech.stopSpeaking();
        this.speech.speak(answer);
        return answer;
      })
    );
  }

  // ── Validación de campos ──────────────────────────────────────────────────

  /**
   * Validates a field value in two layers:
   *  1. Immediate local rules (no network) — CI, email, numeric fields.
   *  2. Backend AI validation for context-dependent or suspicious values.
   *
   * Speaks corrections aloud when a problem is detected.
   * Always fails open on backend errors — never blocks the user.
   */
  validateField(
    fieldId: string,
    value: any,
    fieldSchema: any,
    fullForm: any
  ): Observable<FieldValidationResult> {

    // Nothing to validate for empty values
    if (value === null || value === undefined || String(value).trim() === '') {
      return of({ valid: true });
    }

    const str        = String(value).trim();
    const idLower    = fieldId.toLowerCase();
    const labelLower = (fieldSchema?.label ?? '').toLowerCase();

    // Divide el fieldId en tokens (separa por _, -, espacios) para comparar exacto
    const idTokens = idLower.split(/[_\-\s]+/);

    // ── Regla 1: CI / carnet no debe contener letras ─────────────────────────
    // "ci" debe ser un token completo del fieldId — evita falsos positivos como "solicitante"
    const isCI = idTokens.includes('ci') || idLower === 'cedula' ||
                 idLower.includes('cedula') ||
                 labelLower.includes('carnet de identidad') ||
                 labelLower.includes('c.i.') ||
                 /^ci$/.test(idLower);
    if (isCI && /[a-zA-Z]/.test(str)) {
      const correctedValue = str.replace(/[a-zA-Z]/g, '');
      return this._localError(
        'El carnet de identidad no debe contener letras. He removido las letras automáticamente.',
        correctedValue
      );
    }

    // ── Regla 2: Email debe contener @ ───────────────────────────────────────
    const isEmail = idTokens.includes('email') || idTokens.includes('correo') ||
                    labelLower.includes('email') || labelLower.includes('correo');
    if (isEmail && !str.includes('@')) {
      return this._localError(
        'El correo electrónico no es válido. Asegúrese de incluir el símbolo arroba.'
      );
    }

    // ── Regla 3: Teléfono / campos numéricos — solo dígitos ──────────────────
    const isNumeric = idTokens.includes('telefono') || idTokens.includes('celular') ||
                      idTokens.includes('nro')       || idTokens.includes('numero') ||
                      idTokens.includes('medidor')   || idTokens.includes('contador') ||
                      labelLower.includes('teléfono') || labelLower.includes('número') ||
                      labelLower.includes('telefono');
    if (isNumeric && fieldSchema?.type === 'TEXT' && /\D/.test(str)) {
      const correctedValue = str.replace(/\D/g, '');
      return this._localError(
        `El campo "${fieldSchema?.label ?? fieldId}" solo acepta números. He removido los caracteres inválidos.`,
        correctedValue
      );
    }

    // ── Regla 4: Nombre / texto libre — nunca aplicar reglas numéricas ────────
    const isNameField = labelLower.includes('nombre') || idTokens.includes('nombre');
    if (isNameField) {
      return of({ valid: true }); // nombres siempre válidos localmente
    }

    // ── Validación inteligente por backend ────────────────────────────────────
    return this.http
      .post<{ data: { suggestion: string }; success: boolean }>(
        `${this.base}/assistant/validate-field`,
        { fieldId, value, context: fullForm }
      )
      .pipe(
        map(res => {
          const suggestion = res?.data?.suggestion?.trim();
          if (suggestion) {
            this.speech.stopSpeaking();
            this.speech.speak(suggestion);
          }
          return { valid: true, suggestion: suggestion || undefined };
        }),
        catchError(err => {
          // Fail open — backend errors never block the funcionario
          console.warn('[AssistantService] validate-field:', err?.message ?? err);
          return of({ valid: true });
        })
      );
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private _localError(msg: string, correctedValue?: string): Observable<FieldValidationResult> {
    this.speech.stopSpeaking();
    this.speech.speak(msg);
    return of({ valid: false, suggestion: msg, correctedValue });
  }
}
