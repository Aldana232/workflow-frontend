import { Component, Input, OnInit, inject, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { DocumentService } from '../../../core/services/document.service';
import { ShareService, ShareToken } from '../../../core/services/share.service';

@Component({
  selector: 'app-document-manager',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './document-manager.component.html',
  styleUrl: './document-manager.component.css',
})
export class DocumentManagerComponent implements OnInit {
  @Input() tramiteId: string = '';
  @Input() tramiteCode: string = '';
  @Input() companyId: string = '';
  @Input() nodeId: string = '';
  @Input() nodeName: string = '';
  @Input() canUpload: boolean = true;

  private documentService = inject(DocumentService);
  private shareService    = inject(ShareService);
  private cdr             = inject(ChangeDetectorRef);
  private sanitizer       = inject(DomSanitizer);

  // ── Documentos ──────────────────────────────────────────────────────────
  documents: any[]         = [];
  isLoading: boolean       = false;
  isUploading: boolean     = false;
  selectedCategory: string = 'ANEXO';
  description: string      = '';
  showUploadForm: boolean  = false;
  uploadProgress: number   = 0;
  expandedDocId: string | null = null;
  errorMessage: string     = '';

  private selectedFile: File | null = null;

  // ── Vista previa ─────────────────────────────────────────────────────────
  selectedDoc: any      = null;
  showPreview: boolean  = false;
  previewBlobUrl: string | null = null;

  // ── Links compartibles ──────────────────────────────────────────────────
  shareLinks: ShareToken[] = [];
  shareSuccess: string     = '';
  isGeneratingLink         = false;
  showShareSection         = false;
  loadingLinks             = false;

  ngOnInit(): void {
    this.loadDocuments();
    if (this.canUpload && this.tramiteId) {
      this.loadShareLinks();
    }
  }

  // ── Carga documentos ────────────────────────────────────────────────────

  loadDocuments(): void {
    if (!this.tramiteId) return;
    this.isLoading = true;
    this.errorMessage = '';
    this.documentService.getDocumentsByTramite(this.tramiteId).subscribe({
      next: (docs) => {
        this.documents = docs ?? [];
        this.isLoading = false;
        this.cdr.markForCheck();
      },
      error: () => {
        this.errorMessage = 'No se pudieron cargar los documentos.';
        this.isLoading = false;
        this.cdr.markForCheck();
      },
    });
  }

  // ── Subida ───────────────────────────────────────────────────────────────

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.selectedFile = input.files?.[0] ?? null;
    this.errorMessage = '';
  }

  uploadDocument(): void {
    if (!this.selectedFile) {
      this.errorMessage = 'Selecciona un archivo primero.';
      return;
    }
    this.isUploading = true;
    this.errorMessage = '';
    this.documentService
      .uploadDocument(this.selectedFile, {
        tramiteId:    this.tramiteId,
        tramiteCode:  this.tramiteCode,
        companyId:    this.companyId,
        nodeId:       this.nodeId,
        nodeName:     this.nodeName,
        category:     this.selectedCategory,
        description:  this.description,
      })
      .subscribe({
        next: () => {
          this.isUploading      = false;
          this.showUploadForm   = false;
          this.selectedFile     = null;
          this.description      = '';
          this.selectedCategory = 'ANEXO';
          this.cdr.markForCheck();
          this.loadDocuments();
        },
        error: () => {
          this.errorMessage = 'Error al subir el documento. Intente nuevamente.';
          this.isUploading  = false;
          this.cdr.markForCheck();
        },
      });
  }

  // ── Descarga / eliminación ───────────────────────────────────────────────

  downloadDocument(doc: any): void {
    this.documentService.downloadDocument(doc.id).subscribe({
      next: (blob: Blob) => {
        const url = URL.createObjectURL(blob);
        const a   = document.createElement('a');
        a.href     = url;
        a.target   = '_blank';
        a.download = doc.fileName;
        a.click();
        URL.revokeObjectURL(url);
      },
      error: () => {
        this.errorMessage = 'No se pudo descargar el documento.';
      },
    });
  }

  deleteDocument(doc: any): void {
    if (!confirm(`¿Eliminar el documento "${doc.fileName}"?`)) return;
    this.documentService.deleteDocument(doc.id).subscribe({
      next: () => {
        if (this.expandedDocId === doc.id) this.expandedDocId = null;
        if (this.selectedDoc?.id === doc.id) this.closePreview();
        this.cdr.markForCheck();
        this.loadDocuments();
      },
      error: () => {
        this.errorMessage = 'No se pudo eliminar el documento.';
        this.cdr.markForCheck();
      },
    });
  }

  toggleEvents(docId: string): void {
    this.expandedDocId = this.expandedDocId === docId ? null : docId;
  }

  cancelUpload(): void {
    this.showUploadForm   = false;
    this.selectedFile     = null;
    this.description      = '';
    this.selectedCategory = 'ANEXO';
    this.errorMessage     = '';
  }

  // ── Vista previa ─────────────────────────────────────────────────────────

  openPreview(doc: any): void {
    this.selectedDoc    = doc;
    this.showPreview    = true;
    this.previewBlobUrl = null;

    const type = this.getDocumentType(doc);
    if (type === 'image' || type === 'pdf') {
      this.documentService.downloadDocument(doc.id).subscribe({
        next: (blob: Blob) => {
          this.previewBlobUrl = URL.createObjectURL(blob);
          this.cdr.markForCheck();
        },
        error: () => {
          this.previewBlobUrl = null;
          this.cdr.markForCheck();
        },
      });
    }
  }

  closePreview(): void {
    if (this.previewBlobUrl) {
      URL.revokeObjectURL(this.previewBlobUrl);
      this.previewBlobUrl = null;
    }
    this.selectedDoc = null;
    this.showPreview = false;
  }

  getDocumentType(doc: any): 'image' | 'pdf' | 'excel' | 'word' | 'other' {
    const mime = doc.mimeType || '';
    const name = (doc.fileName || '').toLowerCase();
    if (mime.startsWith('image/') || /\.(jpg|jpeg|png|gif|webp|svg)$/.test(name)) return 'image';
    if (mime === 'application/pdf' || name.endsWith('.pdf')) return 'pdf';
    if (mime.includes('spreadsheet') || mime.includes('excel') || /\.(xlsx|xls|csv)$/.test(name)) return 'excel';
    if (mime.includes('word') || /\.(docx|doc)$/.test(name)) return 'word';
    return 'other';
  }

  getSafeUrl(url: string): SafeResourceUrl {
    return this.sanitizer.bypassSecurityTrustResourceUrl(url);
  }

  // ── Links compartibles ──────────────────────────────────────────────────

  loadShareLinks(): void {
    if (!this.tramiteId) return;
    this.loadingLinks = true;
    this.shareService.getTokensByTramite(this.tramiteId).subscribe({
      next: (links) => {
        this.shareLinks   = links ?? [];
        this.loadingLinks = false;
        this.cdr.markForCheck();
      },
      error: () => {
        this.loadingLinks = false;
        this.cdr.markForCheck();
      },
    });
  }

  generateShareLink(): void {
    if (!this.tramiteId || this.isGeneratingLink) return;
    this.isGeneratingLink = true;
    this.shareSuccess     = '';
    this.cdr.markForCheck();

    this.shareService.generateToken(this.tramiteId, this.tramiteCode).subscribe({
      next: (result) => {
        this.isGeneratingLink = false;
        this.copyToClipboard(result.shareUrl);
        this.loadShareLinks();
        this.cdr.markForCheck();
      },
      error: () => {
        this.isGeneratingLink = false;
        this.shareSuccess = 'ERROR';
        this.cdr.markForCheck();
      },
    });
  }

  copyLinkToClipboard(url: string): void {
    this.copyToClipboard(url);
  }

  private copyToClipboard(url: string): void {
    navigator.clipboard.writeText(url).then(() => {
      this.shareSuccess = url;
      this.cdr.markForCheck();
      setTimeout(() => { this.shareSuccess = ''; this.cdr.markForCheck(); }, 6000);
    }).catch(() => {
      this.shareSuccess = url;
      this.cdr.markForCheck();
    });
  }

  revokeLink(tokenId: string): void {
    if (!confirm('¿Revocar este link? Quien lo tenga ya no podrá acceder.')) return;
    this.shareService.revokeToken(tokenId).subscribe({
      next: () => {
        this.loadShareLinks();
        this.cdr.markForCheck();
      },
      error: () => {
        this.cdr.markForCheck();
      },
    });
  }

  // ── Helpers de presentación ─────────────────────────────────────────────

  getFileIcon(mimeType: string): string {
    if (!mimeType) return '📎';
    if (mimeType === 'application/pdf') return '📄';
    if (mimeType.startsWith('image/')) return '🖼️';
    if (mimeType.includes('spreadsheet') || mimeType.includes('excel') || mimeType.includes('csv')) return '📊';
    if (mimeType.startsWith('video/')) return '🎬';
    return '📎';
  }

  formatFileSize(bytes: number): string {
    if (!bytes || bytes === 0) return '0 KB';
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  formatDate(date: string): string {
    if (!date) return '—';
    return new Date(date).toLocaleDateString('es-ES', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  }

  isExpired(expiresAt: string): boolean {
    return new Date(expiresAt) < new Date();
  }

  get selectedFileName(): string {
    return this.selectedFile ? this.selectedFile.name : '';
  }
}
