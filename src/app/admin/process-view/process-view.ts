import { Component, inject, OnInit, ChangeDetectorRef, ChangeDetectionStrategy } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { ProcessService } from '../../core/services/process';
import { BpmnDiagram } from '../../shared/components/bpmn-diagram/bpmn-diagram';

@Component({
  selector: 'app-process-view',
  imports: [BpmnDiagram],
  templateUrl: './process-view.html',
  styleUrl: './process-view.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProcessView implements OnInit {
  private route          = inject(ActivatedRoute);
  private router         = inject(Router);
  private processService = inject(ProcessService);
  private cdr            = inject(ChangeDetectorRef);

  process: any = null;
  bpmnXml      = '';
  loading      = true;

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) { this.router.navigate(['/admin/processes']); return; }

    this.processService.getById(id).subscribe({
      next: (p: any) => {
        this.process = p;
        this.bpmnXml = p.bpmnXml ?? '';
        this.loading = false;
        this.cdr.markForCheck();
      },
      error: () => { this.loading = false; this.cdr.markForCheck(); },
    });
  }

  edit(): void {
    this.router.navigate(['/admin/designer', this.process?.id]);
  }

  back(): void {
    this.router.navigate(['/admin/processes']);
  }

  statusMod(status: string): string {
    const map: Record<string, string> = {
      PUBLISHED: 'activo', ACTIVO: 'activo',
      DRAFT:     'draft',
      DEPRECATED:'deprecated',
    };
    return map[status?.toUpperCase()] ?? 'draft';
  }
}
