// ── bpmn-js modules ──────────────────────────────────────────────────────────
declare module 'bpmn-js/lib/Modeler' {
  const BpmnModeler: any;
  export default BpmnModeler;
}

declare module 'bpmn-js/lib/Viewer' {
  const BpmnViewer: any;
  export default BpmnViewer;
}

// ── Web Speech API ────────────────────────────────────────────────────────────
// Declaraciones completas porque esta versión de TypeScript no las incluye
// en lib.dom.d.ts. Las interfaces se fusionan sin conflicto con el lib.

interface SpeechRecognitionAlternative {
  readonly transcript: string;
  readonly confidence: number;
}

interface SpeechRecognitionResult {
  readonly isFinal: boolean;
  readonly length:  number;
  item(index: number): SpeechRecognitionAlternative;
  [index: number]: SpeechRecognitionAlternative;
}

interface SpeechRecognitionResultList {
  readonly length: number;
  item(index: number): SpeechRecognitionResult;
  [index: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionEvent extends Event {
  readonly resultIndex: number;
  readonly results:     SpeechRecognitionResultList;
}

interface SpeechRecognitionErrorEvent extends Event {
  readonly error:   string;
  readonly message: string;
}

declare class SpeechRecognition extends EventTarget {
  continuous:      boolean;
  interimResults:  boolean;
  lang:            string;
  maxAlternatives: number;

  onresult:    ((event: SpeechRecognitionEvent)      => void) | null;
  onerror:     ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend:       (() => void) | null;
  onstart:     (() => void) | null;
  onspeechend: (() => void) | null;
  onnomatch:   ((event: SpeechRecognitionEvent)      => void) | null;

  start():  void;
  stop():   void;
  abort():  void;
}

interface Window {
  SpeechRecognition:       typeof SpeechRecognition;
  webkitSpeechRecognition: typeof SpeechRecognition;
}
