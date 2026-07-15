import {
  Component,
  Input,
  Output,
  EventEmitter,
  OnInit,
  OnChanges,
  inject,
  DestroyRef,
} from '@angular/core';
import { ReactiveFormsModule, FormGroup, FormControl, Validators } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom, ReplaySubject, EMPTY } from 'rxjs';
import { debounceTime, pairwise, startWith, switchMap, map } from 'rxjs/operators';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { environment } from '../../../../environments/environment';
import { AssistantService, FieldValidationResult } from '../../../core/services/assistant';
import { LucidePaperclip, LucideCloudUpload, LucideBot } from '@lucide/angular';

export interface FormField {
  name: string;
  label: string;
  type: 'TEXT' | 'TEXTAREA' | 'SELECT' | 'CHECKBOX' | 'FILE';
  required?: boolean;
  options?: { label: string; value: any }[];
  placeholder?: string;
  value?: any;
}

interface FileState {
  uploading: boolean;
  fileName: string | null;
  fileUrl: string | null;
  error: string | null;
}

@Component({
  selector: 'app-dynamic-form',
  imports: [ReactiveFormsModule, LucidePaperclip, LucideCloudUpload, LucideBot],
  templateUrl: './dynamic-form.html',
  styleUrl: './dynamic-form.css',
})
export class DynamicForm implements OnInit, OnChanges {
  @Input() fields: FormField[] = [];
  @Input() submitLabel = 'Enviar';
  @Output() formSubmit = new EventEmitter<Record<string, any>>();

  private http             = inject(HttpClient);
  private assistantService = inject(AssistantService);
  private destroyRef       = inject(DestroyRef);

  form!: FormGroup;
  fileStates: Record<string, FileState> = {};

  /** AI hints keyed by field name — spoken aloud and shown below the field. */
  aiHints: Record<string, string | undefined> = {};

  /**
   * ReplaySubject(1) so that if buildForm() runs before the pipeline
   * subscribes (ngOnChanges before ngOnInit), the latest form is replayed
   * immediately on subscription.
   */
  private formSource$ = new ReplaySubject<FormGroup>(1);

  ngOnInit(): void {
    this.buildForm();
    this.setupValidationPipeline();
  }

  ngOnChanges(): void {
    this.buildForm();
  }

  private buildForm(): void {
    if (!this.fields?.length) return;

    const controls: Record<string, FormControl> = {};
    for (const field of this.fields) {
      const initial = field.value ?? (field.type === 'CHECKBOX' ? false : '');
      const validators = field.required && field.type !== 'FILE'
        ? [Validators.required]
        : [];
      controls[field.name] = new FormControl(initial, validators);

      if (field.type === 'FILE') {
        this.fileStates[field.name] = { uploading: false, fileName: null, fileUrl: null, error: null };
      }
    }
    this.form = new FormGroup(controls);
    this.aiHints = {};              // clear stale AI hints on form rebuild
    this.formSource$.next(this.form);
  }

  /**
   * Reactive validation pipeline — set up once in ngOnInit.
   *
   * Flow: formSource$ emits new FormGroup → switchMap subscribes to its
   * valueChanges → debounce → pairwise diff to find changed field →
   * switchMap cancels previous backend call → AssistantService.validateField
   * → store hint for display.
   */
  private setupValidationPipeline(): void {
    this.formSource$.pipe(
      // Switch to the latest form's valueChanges whenever buildForm() is called
      switchMap(form =>
        form.valueChanges.pipe(
          debounceTime(700),
          startWith(form.value),  // seed pairwise so the first real change is caught
          pairwise(),             // emit [previousValues, currentValues]
        )
      ),
      // Cancel the in-flight backend call when a new field change arrives
      switchMap(([prev, curr]: [Record<string, any>, Record<string, any>]) => {
        const changedField = Object.keys(curr).find(k => curr[k] !== prev[k]);
        if (!changedField) return EMPTY;

        const schema = this.fields.find(f => f.name === changedField);
        // Only TEXT / TEXTAREA fields benefit from AI hints; skip FILE, CHECKBOX, SELECT
        if (!schema || (schema.type !== 'TEXT' && schema.type !== 'TEXTAREA')) return EMPTY;

        return this.assistantService
          .validateField(changedField, curr[changedField], schema, curr)
          .pipe(map((result: FieldValidationResult) => ({ fieldId: changedField, result })));
      }),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe(({ fieldId, result }) => {
      this.aiHints[fieldId] = result.suggestion;
      // Aplicar corrección automática si el servicio la calculó (CI, teléfono, etc.)
      if (result.correctedValue !== undefined) {
        this.getControl(fieldId).setValue(result.correctedValue, { emitEvent: false });
      }
    });
  }

  getControl(name: string): FormControl {
    return this.form.get(name) as FormControl;
  }

  isInvalid(name: string): boolean {
    const ctrl = this.form?.get(name);
    return !!ctrl && ctrl.invalid && ctrl.touched;
  }

  async onFileChange(field: FormField, event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    const allowed = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (!allowed.includes(file.type)) {
      this.fileStates[field.name].error = 'Solo se permiten PDF, JPG, PNG o WEBP.';
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      this.fileStates[field.name].error = 'El archivo no puede superar 20 MB.';
      return;
    }

    const state = this.fileStates[field.name];
    state.uploading = true;
    state.error = null;
    state.fileName = null;
    state.fileUrl = null;
    this.getControl(field.name).setValue(null);

    try {
      const fd = new FormData();
      fd.append('file', file);

      const res = await firstValueFrom(
        this.http.post<{ url: string; fileName: string }>(
          'https://api.workflow-demo.site/api/files/upload',
          fd
        )
      );

      if (!res?.url) throw new Error('No se recibió URL del archivo');

      this.getControl(field.name).setValue(res.url);
      state.fileName = res.fileName ?? file.name;
      state.fileUrl  = res.url;
    } catch {
      state.error = 'Error al subir el archivo. Intente nuevamente.';
      if (field.required) this.getControl(field.name).setErrors({ uploadFailed: true });
    } finally {
      state.uploading = false;
    }
  }

  isImageUrl(url: string | null): boolean {
    if (!url) return false;
    return /\.(jpe?g|png|webp|gif)(\?.*)?$/i.test(url);
  }

  submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.formSubmit.emit({ ...this.form.value });
  }
}
