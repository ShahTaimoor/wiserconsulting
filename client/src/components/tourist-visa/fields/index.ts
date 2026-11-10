import type { ComponentType } from "react";
import type { AnswerType } from "@/shared/tourist-visa/engine";
import { AcknowledgeField } from "./AcknowledgeField";
import { AddressField } from "./AddressField";
import { AmountField } from "./AmountField";
import { CheckboxGroupField } from "./CheckboxGroupField";
import { CountryField } from "./CountryField";
import { DateField } from "./DateField";
import { DurationField } from "./DurationField";
import { EmailField } from "./EmailField";
import { FileField } from "./FileField";
import { LongTextField } from "./LongTextField";
import { MonthYearField } from "./MonthYearField";
import { NumberField } from "./NumberField";
import { SelectField } from "./SelectField";
import { TelephoneField } from "./TelephoneField";
import { TextField } from "./TextField";
import { YesNoField } from "./YesNoField";
import type { FieldProps } from "./types";

/**
 * One renderer per answer type. The record is typed over every AnswerType, so adding a
 * type to the shared config without adding its renderer here is a compile error.
 */
export const FIELD_RENDERERS: Record<AnswerType, ComponentType<FieldProps>> = {
  TXT: TextField,
  LNG: LongTextField,
  DATE: DateField,
  MY: MonthYearField,
  NUM: NumberField,
  DUR: DurationField,
  AMT: AmountField,
  YN: YesNoField,
  SEL: SelectField,
  CTRY: CountryField,
  CHK: CheckboxGroupField,
  ADDR: AddressField,
  TEL: TelephoneField,
  EML: EmailField,
  ACK: AcknowledgeField,
  FILE: FileField,
};

/** Types drawn as a labelled group (fieldset + legend) because they have several controls. */
export const GROUPED_TYPES: ReadonlySet<AnswerType> = new Set<AnswerType>(["YN", "CHK", "ADDR", "DUR", "TEL", "AMT"]);

/** Types whose own label sits beside the control (a single tick box). */
export const INLINE_LABEL_TYPES: ReadonlySet<AnswerType> = new Set<AnswerType>(["ACK"]);
