import {
  AfterViewInit,
  Component,
  ElementRef,
  forwardRef, Inject,
  Input,
  OnChanges,
  OnDestroy,
  OnInit,
  Renderer2,
  SimpleChanges,
  ViewChild
} from '@angular/core';
import {FormControl, FormGroup, NG_VALUE_ACCESSOR, Validators} from '@angular/forms';
import {
  debounceTime,
  distinctUntilChanged,
  filter, first,
  map,
  shareReplay, skip,
  startWith,
  switchMap,
  takeUntil,
  tap
} from 'rxjs/operators';
import {BehaviorSubject, combineLatest, Observable, of, ReplaySubject} from 'rxjs';
import {DICTIONARY_CONFIG_TOKEN, DictionaryConfig, DictNode} from '../model/dictionary.model';
import {DictionaryDialogComponent} from '../dictionary-dialog/dictionary-dialog.component';
import {MatDialog} from "@angular/material/dialog";
import {DictionaryService} from "../service/dictionary.service";
import {isArrayFromObjectsWithId, isObjectWithId} from "../is-object-with-id";


@Component({
  selector: 'app-dictionary-input',
  templateUrl: './dictionary-input.component.html',
  styleUrls: ['./dictionary-input.component.scss'],
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => DictionaryInputComponent),
      multi: true
    }
  ]
})
export class DictionaryInputComponent implements OnInit, OnDestroy, OnChanges {

  @Input() inputValue;
  @Input() placeholder = '...';
  @Input() label;
  @Input() data: { oid: string, parentId?: number, form: FormGroup };
  @Input() outputDataType?: 'object' | 'number';

  @ViewChild('inputElement', {static: false}) input: ElementRef;

  dictInputControl = new FormControl('');

  dictMeta;

  isLoading = false;

  dicRecords: Observable<DictNode[]>;

  paramsForRequest: BehaviorSubject<any>;
  oidSubject: BehaviorSubject<string>;

  destroy: ReplaySubject<any> = new ReplaySubject<any>(1);


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
    const normalizedValue = value == null ? '' : value;
    this.dictInputControl.setValue(normalizedValue);
  }

  setDisabledState(isDisabled: boolean): void {
    isDisabled ? this.dictInputControl.disable() : this.dictInputControl.enable();
  }

  constructor(public dictService: DictionaryService,
              public dialog: MatDialog,
              @Inject(DICTIONARY_CONFIG_TOKEN) private config: DictionaryConfig) {
  }

  ngOnInit() {
    this.paramsForRequest = new BehaviorSubject({});
    this.oidSubject = new BehaviorSubject(this.data.oid);

    this.oidSubject.pipe(
      tap(() => this.isLoading = true),
      switchMap(oid => this.dictService.getMetadataByOID(oid)),
      takeUntil(this.destroy)
    ).subscribe(dicMeta => {
      this.dictMeta = dicMeta;
      if (dicMeta.dictionarySize > 500 && (!dicMeta.parameters || dicMeta.parameters && !dicMeta.parameters.length)) {
        this.placeholder = 'введите минимум 3 символа';
      }
      this.dictInputControl.setValidators(dicMeta.multiSelection ? [isArrayFromObjectsWithId] : [isObjectWithId]);
      this.dictInputControl.updateValueAndValidity();
      this.paramsForRequest.next(this.getObjectOfParams());
      this.isLoading = false;
    });

    // инициализируем контрол (по айди получаем словарную запись)
    this.dictInputControl.valueChanges.pipe(
      first(),
      filter(val => {
        return val instanceof Array &&
          val.some(el => typeof el === 'number' || el.toString().match(/^\d+$/)) ||
          typeof val === 'number' || val.toString().match(/^\d+$/)
      }),
      map(val => {
        if (val instanceof Array) {
          return val.filter(el => typeof el === 'number' || el.toString().match(/^\d+$/));
        } else {
          return val;
        }
      }),
      switchMap(val => {
        if (val instanceof Array) {
          return combineLatest(val.map(id => this.dictService.getById(this.data.oid, id as number)));
        } else {
          return this.dictService.getById(this.data.oid, val as number);
        }
      }),
      takeUntil(this.destroy)
    ).subscribe(data => {
      // Если в результате словарных записей будут невалидные записи, отфильтровываем их
      if (data instanceof Array) {
        data = data.filter(record => record && record.id && typeof +record.id === 'number');
      }
      this.dictInputControl.setValue(data, {emitEvent: false});
    });

    this.dicRecords =
      this.paramsForRequest.pipe(
        filter(params => {
          return this.dictMeta.parameters.length ? params.hasOwnProperty(this.dictMeta.parameters[0].fieldName) : true;
        }),
        switchMap(params => this.dictInputControl.valueChanges.pipe(
          filter(value => typeof value === 'string'),
          startWith(''),
          this.dictService.fixKeyboardLayout(),
          debounceTime(500),
          distinctUntilChanged(),
          map(searchStr => ({params, searchStr}))
        )),
        distinctUntilChanged(),
        switchMap(({params, searchStr}) => {
          this.dictInputControl.setErrors(null);
          if (searchStr && searchStr.length > 2) {
            return this.dictService.getByNameOrNameAndParams(this.data.oid, params, searchStr)
              .pipe(
                tap(res => {
                  if (!res.length) {
                    this.dictInputControl.setErrors({'notFound': true});
                    this.dictInputControl.markAsTouched();
                  }
                })
              );
          } else if (this.dictMeta.dictionarySize <= 500 || !this.dictMeta.parameters ||
            this.dictMeta.parameters.length) {
            return this.dictService.getHierarchicalDictionary(this.data.oid, params);
          } else {
            return of([]);
          }
        }),
        takeUntil(this.destroy)
      );

    this.dictInputControl.valueChanges.pipe(
      skip(2),
      map(val => {
        if (this.dictInputControl.valid && val) {
          if (this.config.objectAsOutputData && !this.outputDataType || this.outputDataType && this.outputDataType === 'object') {
            return val;
          } else if (val instanceof Array) {
            return val.map(({id}) => id);
          } else {
            return val.id;
          }
        } else {
          return null;
        }
      }),
      distinctUntilChanged(),
      takeUntil(this.destroy)
    ).subscribe(value => {
      this.onChange(value);
    });
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes.data && !changes.data.isFirstChange()) {
      if (changes.data.currentValue.oid !== changes.data.previousValue.oid) {
        this.oidSubject.next(changes.data.currentValue.oid);
      }
      if (this.dictMeta && this.dictMeta.parameters && changes.data.currentValue.form) {
        const prev = changes.data.previousValue.form;
        const curr = changes.data.currentValue.form;
        if (!prev || this.dictMeta.parameters.some(({fieldName}) => curr[fieldName] !== prev[fieldName])) {
          this.dictInputControl.reset('');
          this.paramsForRequest.next(this.getObjectOfParams());
        }
      }
    }
  }

  ngOnDestroy(): void {
    this.destroy.next(null);
    this.destroy.complete();
  }

  getObjectOfParams(): any {
    const params = {};
    this.dictMeta.parameters.forEach(param => {
      if (this.data.form[param.fieldName]) {
        params[param.fieldName] = this.data.form[param.fieldName];
      }
    });
    return params;
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
      // Данные для диалогового окна словаря (выбранное(ые) значение(ия), ОИД, форма)
      data: {
        oid: this.data.oid,
        ids: [(this.dictInputControl.value) ? this.dictInputControl.value.id : null],
        dictMeta: this.dictMeta,
        form: this.data.form
      }
    });
    dialogRef.afterClosed().pipe(takeUntil(this.destroy)).subscribe(result => {
      if (result) {
        this.dictInputControl.markAsDirty();
        this.dictInputControl.markAsTouched();
        this.dictInputControl.setValue((result.length) ? result[0] : result);
      }
    });
  }
}
