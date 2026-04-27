import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { VoiceCommand } from '../models/voice-command.model';

@Injectable({ providedIn: 'root' })
export class VoiceService {
  private http = inject(HttpClient);
  private base = environment.apiUrl;

  parseCommand(text: string, processId: string): Observable<VoiceCommand> {
    return this.http.post<VoiceCommand>(`${this.base}/voice/command`, { text, processId });
  }
}
