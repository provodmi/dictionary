import {FormControl, ValidationErrors, ValidatorFn} from '@angular/forms';

export const isObjectWithId: ValidatorFn = (control: FormControl): ValidationErrors | null => {
  return control.value && typeof +control.value.id === 'number' || !control.value ? null : {isNotObject: true};
};

export const isArrayFromObjectsWithId: ValidatorFn = (control: FormControl): ValidationErrors | null => {
  return control.value && control.value.length && control.value.every(val => typeof +val.id === 'number') ||
    control.value && !control.value.length || !control.value ? null : {isNotObject: true};
};
