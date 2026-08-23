// Google Forms question types (from FB_PUBLIC_LOAD_DATA_[1][1][*][3]).
export enum GoogleFormQuestionType {
  SHORT_TEXT = 0,
  PARAGRAPH = 1,
  RADIO = 2,
  DROPDOWN = 3,
  CHECKBOX = 4,
  LINEAR_SCALE = 5,
  GRID = 7,
  DATE = 9,
  TIME = 10,
}

export interface FormQuestion {
  title: string;
  type: number;
  entryId: string; // e.g. "entry.123456789"
  options: string[];
  required: boolean;
}

export interface FormAnswer {
  entryId: string;
  // string for single-value questions, string[] for checkboxes.
  answer: string | string[];
}
