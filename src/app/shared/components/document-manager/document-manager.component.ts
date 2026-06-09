import { Component, Input, OnInit, inject, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DocumentService } from '../../../core/services/document.service';

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
  private cdr = inject(ChangeDetectorRef);

  documents: any[] = [];
  isLoading: boolean = false;
  isUploading: boolean = false;
  selectedCategory: string = 'ANEXO';
  description: string = '';
  showUploadForm: boolean = false;
  uploadProgress: number = 0;
  expandedDocId: string | null = null;
  errorMessage: string = '';

  private selectedFile: File | null = null;

  ngOnInit(): void {
    this.loadDocuments();
  }

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
      error: (err) => {
        console.error('Error al cargar documentos', err);
        this.errorMessage = 'No se pudieron cargar los documentos.';
        this.isLoading = false;
        this.cdr.markForCheck();
      },
    });
  }

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
        tramiteId: this.tramiteId,
        tramiteCode: this.tramiteCode,
        companyId: this.companyId,
        nodeId: this.nodeId,
        nodeName: this.nodeName,
        category: this.selectedCategory,
        description: this.description,
      })
      .subscribe({
        next: () => {
          this.isUploading = false;
          this.showUploadForm = false;
          this.selectedFile = null;
          this.description = '';
          this.selectedCategory = 'ANEXO';
          this.cdr.markForCheck();
          this.loadDocuments();
        },
        error: (err) => {
          console.error('Error al subir documento', err);
          this.errorMessage = 'Error al subir el documento. Intente nuevamente.';
          this.isUploading = false;
          this.cdr.markForCheck();
        },
      });
  }

  downloadDocument(doc: any): void {
    this.documentService.downloadDocument(doc.id).subscribe({
      next: (blob: Blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.target = '_blank';
        a.download = doc.fileName;
        a.click();
        URL.revokeObjectURL(url);
      },
      error: (err) => {
        console.error('Error al descargar documento', err);
        this.errorMessage = 'No se pudo descargar el documento.';
      },
    });
  }

  deleteDocument(doc: any): void {
    if (!confirm(`¿Eliminar el documento "${doc.fileName}"?`)) return;
    this.documentService.deleteDocument(doc.id).subscribe({
      next: () => {
        if (this.expandedDocId === doc.id) this.expandedDocId = null;
        this.cdr.markForCheck();
        this.loadDocuments();
      },
      error: (err) => {
        console.error('Error al eliminar documento', err);
        this.errorMessage = 'No se pudo eliminar el documento.';
        this.cdr.markForCheck();
      },
    });
  }

  toggleEvents(docId: string): void {
    this.expandedDocId = this.expandedDocId === docId ? null : docId;
  }

  cancelUpload(): void {
    this.showUploadForm = false;
    this.selectedFile = null;
    this.description = '';
    this.selectedCategory = 'ANEXO';
    this.errorMessage = '';
  }

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
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  get selectedFileName(): string {
    return this.selectedFile ? this.selectedFile.name : '';
  }
}
