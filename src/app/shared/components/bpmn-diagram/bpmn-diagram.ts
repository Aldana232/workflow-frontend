import {
  Component,
  Input,
  OnChanges,
  AfterViewInit,
  OnDestroy,
  ViewChild,
  ElementRef,
} from '@angular/core';

@Component({
  selector: 'app-bpmn-diagram',
  imports: [],
  template: `<div #canvas class="bpmn-canvas"></div>`,
  styles: [`:host { display: block; width: 100%; height: 100%; }
            .bpmn-canvas { width: 100%; height: 100%; }`],
})
export class BpmnDiagram implements AfterViewInit, OnChanges, OnDestroy {
  @Input() xml = '';
  @Input() highlightId: string | null = null;

  @ViewChild('canvas', { static: true }) canvasRef!: ElementRef<HTMLDivElement>;

  private viewer: any = null;
  private ready = false;

  async ngAfterViewInit(): Promise<void> {
    const { default: Viewer } = await import('bpmn-js/lib/Viewer');
    this.viewer = new Viewer({ container: this.canvasRef.nativeElement });
    this.ready = true;
    if (this.xml) await this.render();
  }

  async ngOnChanges(): Promise<void> {
    if (this.ready && this.xml) await this.render();
  }

  private async render(): Promise<void> {
    try {
      await this.viewer.importXML(this.xml);
      this.viewer.get('canvas').zoom('fit-viewport', 'auto');
      if (this.highlightId) {
        try {
          this.viewer.get('canvas').addMarker(this.highlightId, 'highlight-current');
        } catch { /* nodo no encontrado */ }
      }
    } catch { /* xml inválido */ }
  }

  ngOnDestroy(): void {
    this.viewer?.destroy();
  }
}
