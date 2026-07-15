import { Component, Input, OnInit, OnDestroy, inject, ElementRef, ViewChild, ChangeDetectorRef, NgZone } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LucideTriangleAlert } from '@lucide/angular';
import { OnlyOfficeService } from '../../services/onlyoffice.service';

@Component({
  selector: 'app-document-editor',
  standalone: true,
  imports: [CommonModule, LucideTriangleAlert],
  templateUrl: './document-editor.component.html',
  styleUrl: './document-editor.component.css'
})
export class DocumentEditorComponent implements OnInit, OnDestroy {
  @Input() documentId!: string;
  @Input() documentName: string = 'Documento';
  @ViewChild('editorContainer') editorContainer!: ElementRef;

  private onlyOfficeService = inject(OnlyOfficeService);
  private cdr = inject(ChangeDetectorRef);
  private ngZone = inject(NgZone);

  isLoading = true;
  hasError = false;
  errorMessage = '';
  private docEditor: any = null;

  ngOnInit(): void {
    this.loadEditor();
  }

  ngOnDestroy(): void {
    if (this.docEditor) {
      this.docEditor.destroyEditor();
    }
  }

  private loadEditor(): void {
    this.onlyOfficeService.getEditorConfig(this.documentId).subscribe({
      next: (config) => {
        this.loadOnlyOfficeScript(config);
      },
      error: (err) => {
        this.isLoading = false;
        this.hasError = true;
        this.errorMessage = err.error?.error || 'No tienes acceso a este documento';
      }
    });
  }

  private loadOnlyOfficeScript(config: any): void {
    const scriptUrl = `${config.documentServerUrl}/web-apps/apps/api/documents/api.js`;

    // Verificar si el script ya está cargado
    const existingScript = document.querySelector(`script[src="${scriptUrl}"]`);
    if (existingScript) {
      this.initEditor(config);
      return;
    }

    const script = document.createElement('script');
    script.src = scriptUrl;
    script.onload = () => this.initEditor(config);
    script.onerror = () => {
      this.isLoading = false;
      this.hasError = true;
      this.errorMessage = 'No se pudo conectar con el servidor de OnlyOffice';
    };
    document.head.appendChild(script);
  }

  private initEditor(config: any): void {
    try {
      const editorConfig = {
        document: config.document,
        documentType: config.documentType,
        editorConfig: config.editorConfig,
        token: config.token,
        height: '100%',
        width: '100%',
        events: {
          onReady: () => {
            this.ngZone.run(() => {
              this.isLoading = false;
              this.cdr.detectChanges();
            });
          },
          onError: (event: any) => {
            this.ngZone.run(() => {
              this.isLoading = false;
              this.hasError = true;
              this.errorMessage = 'Error al cargar el editor';
              this.cdr.detectChanges();
            });
          }
        }
      };

      // @ts-ignore
      this.docEditor = new DocsAPI.DocEditor('onlyoffice-editor', editorConfig);
    } catch (e) {
      this.isLoading = false;
      this.hasError = true;
      this.errorMessage = 'Error inicializando el editor';
    }
  }
}
