import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { ShareService } from '../../core/services/share.service';
import {
  LucideClockAlert, LucideBan, LucideDroplet, LucideFolderOpen,
  LucideFileText, LucideImage, LucideFileSpreadsheet, LucideVideo, LucidePaperclip,
  LucideMapPin, LucideBuilding2, LucideUser, LucideExternalLink, LucideClock,
} from '@lucide/angular';

@Component({
  selector: 'app-shared-docs',
  standalone: true,
  imports: [
    CommonModule,
    LucideClockAlert, LucideBan, LucideDroplet, LucideFolderOpen,
    LucideFileText, LucideImage, LucideFileSpreadsheet, LucideVideo, LucidePaperclip,
    LucideMapPin, LucideBuilding2, LucideUser, LucideExternalLink, LucideClock,
  ],
  templateUrl: './shared-docs.component.html',
  styleUrl: './shared-docs.component.css',
})
export class SharedDocsComponent implements OnInit {
  private route  = inject(ActivatedRoute);
  private share  = inject(ShareService);

  isLoading  = true;
  isExpired  = false;
  isInvalid  = false;
  tramite:  any = null;
  documents: any[] = [];
  tramiteCode = '';
  expiresAt   = '';

  ngOnInit(): void {
    const token = this.route.snapshot.paramMap.get('token') ?? '';
    if (!token) { this.isInvalid = true; this.isLoading = false; return; }

    this.share.validateToken(token).subscribe({
      next: (data) => {
        console.log('SHARED DOCS - data recibida:', data);
        this.tramiteCode = data.tramiteCode ?? '';
        this.expiresAt   = data.expiresAt ?? '';
        this.documents   = data.documents ?? [];
        this.tramite     = data;
        this.isLoading   = false;
      },
      error: (err) => {
        console.log('SHARED DOCS - error:', err);
        this.isLoading = false;
        this.isExpired = err.status === 410;
        this.isInvalid = err.status !== 410;
      },
    });
  }

  formatDate(date: string): string {
    if (!date) return '—';
    return new Date(date).toLocaleDateString('es-ES', {
      day: '2-digit', month: 'long', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  }

  formatFileSize(bytes: number): string {
    if (!bytes || bytes === 0) return '0 KB';
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  getFileIcon(mimeType: string): 'pdf' | 'image' | 'spreadsheet' | 'video' | 'other' {
    if (!mimeType) return 'other';
    if (mimeType === 'application/pdf') return 'pdf';
    if (mimeType.startsWith('image/')) return 'image';
    if (mimeType.includes('spreadsheet') || mimeType.includes('excel') || mimeType.includes('csv')) return 'spreadsheet';
    if (mimeType.startsWith('video/')) return 'video';
    return 'other';
  }

  openFile(doc: any): void {
    if (doc.fileUrl) {
      window.open(doc.fileUrl, '_blank', 'noopener');
    }
  }
}
