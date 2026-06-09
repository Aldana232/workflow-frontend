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

  /** Vocaliza el texto en español. Llama onEnd cuando termina (útil para re-escuchar). */
  speak(text: string, onEnd?: () => void): void {
    if (!('speechSynthesis' in window)) {
      console.warn('[SpeechService] speechSynthesis no está disponible en este navegador.');
      onEnd?.();
      return;
    }
    window.speechSynthesis.cancel();

    const utterance   = new SpeechSynthesisUtterance(text);
    utterance.lang    = 'es-ES';
    utterance.rate    = 0.9;
    utterance.pitch   = 1.0;
    utterance.volume  = 1.0;
    utterance.onend   = () => onEnd?.();

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

      // Cancelar TTS antes de iniciar el micrófono
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }

      let recognition: SpeechRecognition | null = null;

      const startRecognition = () => {
        recognition = new SR();
        recognition.lang           = 'es-ES';
        recognition.continuous     = false;
        recognition.interimResults = false;

        recognition.onresult = (event: SpeechRecognitionEvent) => {
          const text = event.results[0]?.[0]?.transcript?.trim() ?? '';
          if (text) observer.next(text);
          observer.complete();
        };

        recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
          // aborted: Chrome aún vaciaba el buffer de TTS — silenciar, el usuario puede reintentar
          // no-speech: el usuario no dijo nada — silenciar también
          if (event.error === 'aborted' || event.error === 'no-speech') {
            observer.complete();
            return;
          }
          const messages: Record<string, string> = {
            'not-allowed':         'Permiso de micrófono denegado. Habilítalo en la configuración del navegador.',
            'audio-capture':       'No se encontró micrófono.',
            'network':             'Error de red al procesar el audio.',
            'service-not-allowed': 'Servicio de voz no disponible.',
          };
          const msg = messages[event.error] ?? `Error de reconocimiento: ${event.error}`;
          console.warn('[SpeechService]', msg);
          observer.error(new Error(msg));
        };

        recognition.onend = () => observer.complete();
        recognition.start();
      };

      // Esperar 200 ms para que Chrome vacíe el buffer de audio de TTS
      // antes de arrancar el reconocimiento (evita el error "aborted")
      const timerId = setTimeout(startRecognition, 200);

      // Limpieza: cancelar el timer si la suscripción se destruye antes de arrancar
      return () => {
        clearTimeout(timerId);
        if (recognition) {
          try { recognition.abort(); } catch { /* ya detenido */ }
        }
      };
    });
  }
}
