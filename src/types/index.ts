/** Shared domain types. */

export type SourceKind = 'paste' | 'url' | 'txt' | 'epub' | 'pdf';

export interface ReadingDocument {
  id: string;
  title: string;
  /** Author / site name when the extractor could find one. */
  byline?: string;
  /** Original URL, for `url` sources. */
  url?: string;
  source: SourceKind;
  text: string;
  wordCount: number;
  /** Token index the reader stopped at. */
  progress: number;
  createdAt: number;
  updatedAt: number;
}

/** Library card: everything except the (potentially huge) body text. */
export type DocumentSummary = Omit<ReadingDocument, 'text'>;

export type ThemeName = 'light' | 'dark' | 'sepia' | 'contrast';
export type FontFamily = 'sans' | 'serif' | 'mono';

export interface Settings {
  /** Words per minute, 100–1000 in steps of 25. */
  wpm: number;
  /** Words shown per frame, 1–3. */
  chunkSize: number;
  fontSize: number;
  fontFamily: FontFamily;
  theme: ThemeName;
  /** Punctuation- and length-aware frame timing. */
  smartPacing: boolean;
  /** Hide punctuation attached to a word while it is on the RSVP frame. */
  stripPunctuation: boolean;
  /** Bionic bolding in the full-text view. */
  bionic: boolean;
  /** Show the vertical guide lines around the ORP letter. */
  showGuides: boolean;
}

/** Progress of an in-flight import, surfaced as a progress bar. */
export interface ParseProgress {
  stage: string;
  /** 0–1, or null when the total is unknown. */
  ratio: number | null;
}

export type ParseProgressHandler = (progress: ParseProgress) => void;

export interface ParsedContent {
  title: string;
  text: string;
  byline?: string;
}
