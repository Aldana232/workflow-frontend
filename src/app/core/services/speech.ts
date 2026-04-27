import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

// Extiende Window para reconocer webkitSpeechRecognition en TypeScript
declare global {
  interface Window {
    SpeechRecognition: typeof SpeechRecognition;
    webkitSpeechRecognition: typeof SpeechRecognition;
  }
}

@Injectable({ providedIn: 'root' })
export class SpeechService {

  // ── Síntesis de voz ────────────────────────────────────────────────────────

  /** Vocaliza el texto en español usando la Web Speech Synthesis API. */
  speak(text: string): void {
    if (!('speechSynthesis' in window)) {
      console.warn('[SpeechService] speechSynthesis no está disponible en este navegador.');
      return;
    }
    window.speechSynthesis.cancel(); // cancela cualquier locución en curso

    const utterance   = new SpeechSynthesisUtterance(text);
    utterance.lang    = 'es-ES';
    utterance.rate    = 0.9;  // ligeramente más lento para mejor comprensión
    utterance.pitch   = 1.0;
    utterance.volume  = 1.0;

    window.speechSynthesis.speak(utterance);
  }

  /** Detiene inmediatamente cualquier voz en curso. */
  stopSpeaking(): void {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
  }

  // ── Reconocimiento de voz ──────────────────────────────────────────────────

  /**
   * Escucha al usuario una sola vez y emite el texto reconocido.
   * El Observable completa después del primer resultado final (continuous: false).
   * Emite error si el navegador no soporta la API o si falla el micrófono.
   */
  listen(): Observable<string> {
    return new Observable<string>(observer => {
      const SR = window.SpeechRecognition ?? window.webkitSpeechRecognition;

      if (!SR) {
        console.warn('[SpeechService] SpeechRecognition no está disponible en este navegador.');
        observer.error(new Error('SpeechRecognition no soportado'));
        return;
      }

      const recognition = new SR();
      recognition.lang        = 'es-ES';
      recognition.continuous  = false;   // para después del primer enunciado completo
      recognition.interimResults = false; // solo resultados finales

      // Emite el primer resultado final y completa
      recognition.onresult = (event: SpeechRecognitionEvent) => {
        const text = event.results[0]?.[0]?.transcript?.trim() ?? '';
        if (text) {
          observer.next(text);
        }
        observer.complete();
      };

      recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
        const messages: Record<string, string> = {
          'not-allowed':         'Permiso de micrófono denegado.',
          'no-speech':           'No se detectó voz.',
          'network':             'Error de red al procesar el audio.',
          'audio-capture':       'No se encontró micrófono.',
          'service-not-allowed': 'Servicio de voz no disponible.',
        };
        const msg = messages[event.error] ?? `Error de reconocimiento: ${event.error}`;
        console.warn('[SpeechService]', msg);
        observer.error(new Error(msg));
      };

      // onend dispara siempre al final (incluso tras error); si el observer
      // ya completó/falló, esta llamada es ignorada por RxJS.
      recognition.onend = () => observer.complete();

      recognition.start();

      // Función de limpieza: al cancelar la suscripción se aborta el reconocimiento
      return () => {
        try { recognition.abort(); } catch { /* ya estaba detenido */ }
      };
    });
  }
}
