import {ENTER} from '@angular/cdk/keycodes';
import {
  Component,
  ElementRef,
  forwardRef,
  Input,
  OnChanges,
  OnDestroy,
  OnInit,
  SimpleChanges,
  ViewChild
} from '@angular/core';
import {FormControl, NG_VALUE_ACCESSOR, Validators} from '@angular/forms';
import {MatAutocomplete, MatAutocompleteSelectedEvent} from '@angular/material/autocomplete';
import {BehaviorSubject, combineLatest, Observable, of, ReplaySubject} from 'rxjs';
import {debounceTime, distinctUntilChanged, filter, startWith, switchMap, takeUntil, tap} from 'rxjs/operators';
import {DictNode} from '../model/dictionary.model';
import {DictionaryDialogComponent} from '../dictionary-dialog/dictionary-dialog.component';
import {MatDialog} from '@angular/material/dialog';
import {DictionaryService} from "../service/dictionary.service";

@Component({
  selector: 'app-chips-autocomplete',
  templateUrl: './chips-autocomplete.component.html',
  styleUrls: ['./chips-autocomplete.component.scss'],
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => ChipsAutocompleteComponent),
      multi: true
    }
  ]
})
export class ChipsAutocompleteComponent implements OnInit, OnChanges, OnDestroy {
  @Input() placeholder = '...';
  @Input() label;
  @Input() data: { oid: string };
  @Input() dictMeta;
  @Input() params: BehaviorSubject<any>;

  holder = this.placeholder;

  identify(index, item) {
    return item.id;
  };

  searchingRequest: string;

  removable = true;
  separatorKeysCodes: number[] = [ENTER];
  records: any[] = [];

  paramsForRequest: BehaviorSubject<{}>;

  dicRecords: Observable<DictNode[]>;
  dictInputControl = new FormControl('', Validators.required);
  destroy: ReplaySubject<any> = new ReplaySubject<any>(1);


  @ViewChild('dicInput', {static: false}) dicInput: ElementRef<HTMLInputElement>;
  @ViewChild('auto', {static: false}) matAutocomplete: MatAutocomplete;

  onChange = (value: any) => {
  };
  onTouched = () => {
  };

  registerOnChange(callback: (change: any) => void): void {
    this.onChange = callback;
  }

  registerOnTouched(callback: () => void): void {
    this.onTouched = callback;
  }

  writeValue(value: any) {
    this.records = value == null ? [] : value;
  }

  setDisabledState(isDisabled: boolean): void {
    isDisabled ? this.dictInputControl.disable() : this.dictInputControl.enable();
  }

  constructor(public dictService: DictionaryService,
              public dialog: MatDialog) { }

  ngOnInit() {
    this.dicRecords = combineLatest([
      this.params.pipe(
        filter(params => {
          return this.dictMeta.parameters.length ? params.hasOwnProperty(this.dictMeta.parameters[0].fieldName) : true;
        })
      ),
      this.dictInputControl.valueChanges.pipe(
        filter(value => typeof value === 'string'),
        startWith(''),
        this.dictService.fixKeyboardLayout(),
        distinctUntilChanged(),
        debounceTime(1000),
      )
    ]).pipe(
      switchMap(([params, searchStr]) => {
        this.dictInputControl.setErrors(null);
        if (searchStr && searchStr.length > 2) {
          return this.dictService.getByNameOrNameAndParams(this.data.oid, params, searchStr)
            .pipe(
              tap(res => {
                if (!res.length) {
                  this.searchingRequest = null;
                  this.dictInputControl.setErrors({'notFound': true});
                  this.dictInputControl.markAsTouched();
                } else {
                  this.searchingRequest = searchStr;
                }
              })
            );
        } else if (this.dictMeta.dictionarySize <= 500 || !this.dictMeta.parameters ||
          this.dictMeta.parameters.length) {
          this.searchingRequest = null;
          return this.dictService.getHierarchicalDictionary(this.data.oid, params);
        } else {
          this.searchingRequest = null;
          return of([]);
        }
      }),
      takeUntil(this.destroy)
    );
  }

  ngOnChanges(changes: SimpleChanges): void { }

  ngOnDestroy(): void {
    this.destroy.next(null);
    this.destroy.complete();
  }

  remove(rd): void {
    const index = this.records.indexOf(rd);

    if (index >= 0) {
      this.records.splice(index, 1);
      this.onChange(this.records.length ? this.records : null);
    }
    if (!this.records.length)  {
      this.dictInputControl.reset();
      this.dictInputControl.markAsTouched();
      this.dictInputControl.markAsDirty();
    }
  }

  /**
   * Открытие диалогового окна со словарем
   */
  openDictDialog(): void {
    const dialogRef = this.dialog.open(DictionaryDialogComponent, {
      height: '80%',
      width: '90%',
      autoFocus: false,
      restoreFocus: false,
      // Данные для диалогового окна словаря (выбранное(ые) значение(ия), ОИД)
      data: {
        oid: this.data.oid,
        ids: this.records.map(data => data.id),
        dictMeta: this.dictMeta
      }
    });
    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        this.records = result.length ? result : [result];
        this.onChange(this.records);
      }
    });
  }

  selected(event: MatAutocompleteSelectedEvent): void {
    if (this.records) {
      this.records.push(event.option.value);
    } else {
      this.records = [event.option.value];
    }
    this.dicInput.nativeElement.value = '';
    this.dictInputControl.reset('');
    this.onChange(this.records);
  }
}
