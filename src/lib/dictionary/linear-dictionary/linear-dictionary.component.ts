import {AfterViewInit, Component, EventEmitter, Input, OnDestroy, OnInit, Output, ViewChild} from '@angular/core';
import {MatPaginator} from '@angular/material/paginator';
import {MatSort} from '@angular/material/sort';
import {MatTableDataSource} from '@angular/material/table';
import {SelectionModel} from '@angular/cdk/collections';
import {HttpClient} from '@angular/common/http';
import {DictionaryService} from '../service/dictionary.service';
import {FormControl} from '@angular/forms';
import {
  debounceTime,
  distinctUntilChanged,
  filter,
  map, shareReplay,
  startWith,
  switchMap,
  switchMapTo,
  takeUntil,
  tap
} from 'rxjs/operators';
import {combineLatest, merge, Observable, of, ReplaySubject, Subject} from 'rxjs';
import {DictNode} from "../model/dictionary.model";

@Component({
  selector: 'app-linear-dictionary',
  templateUrl: './linear-dictionary.component.html',
  styleUrls: ['./linear-dictionary.component.scss']
})
export class LinearDictionaryComponent implements OnInit, OnDestroy {

  constructor(private http: HttpClient, private dictService: DictionaryService) {
  }

  @Input() data;
  @Input() dictMeta;
  @Output() selected = new EventEmitter<any[]>();
  @ViewChild(MatPaginator, {static: true}) paginator: MatPaginator;
  @ViewChild(MatSort, {static: true}) sort: MatSort;

  destroy: ReplaySubject<any> = new ReplaySubject<any>(1);
  allDictionary: ReplaySubject<DictNode[]> = new ReplaySubject<any>(1);

  multiSelection: boolean;
  isLoading;
  dictionaryName = '';
  dictionarySize: number;
  displayedColumns: string[] = ['select'];
  columns = [];
  tableDataSource: MatTableDataSource<any>;
  searchInput: FormControl = new FormControl('');
  selection: SelectionModel<any>;

  dictionary: Observable<DictNode[]>;

  ngOnInit() {
    this.isLoading = true;
    this.multiSelection = !!this.data.multiSelection;
    this.selection = new SelectionModel<any>(this.dictMeta.multiSelection, []);
    this.getSelected();
    this.tableDataSource = new MatTableDataSource<any>();
    this.paginator.pageSize = 10;

    this.dictionarySize = this.dictMeta.dictionarySize;

    Object.keys(this.dictMeta.fieldDescription).forEach(dm => {
      this.columns.push({name: dm, colName: this.dictMeta.fieldDescription[dm]});
      this.displayedColumns.push(dm);
    });

    this.dictionary =
      merge(
        this.sort.sortChange,
        this.paginator.page.pipe(filter(() => !this.searchInput.value))
      ).pipe(
        startWith({}),
        switchMapTo(this.searchInput.valueChanges.pipe(
          startWith(''),
          debounceTime(300),
          this.dictService.fixKeyboardLayout(),
          map(searchStr => {
            if (searchStr.length < 3) {
              return '';
            } else {
              this.paginator.pageIndex = 0;
              this.paginator.pageSize = 10;
              this.searchInput.setValue(searchStr, {emitEvent: false});
              return searchStr;
            }
          }),
          distinctUntilChanged(),
          shareReplay(1)
        )),
        switchMap(search => {
          if (search) {
            return this.getRecsPerPageWithFilter(this.data.oid, '1',
              this.dictMeta.dictionarySize.toString(), search, this.sort.active, this.sort.direction)
              .pipe(
                tap(result => this.dictionarySize = result.length),
                switchMap(result => this.paginator.page.pipe(
                  startWith({pageIndex: this.paginator.pageIndex, pageSize: this.paginator.pageSize}),
                  map(({pageIndex, pageSize}) => result.slice(pageIndex * pageSize, ++pageIndex * pageSize))
                ))
              );
          } else {
            return this.getRecsPerPage(this.data.oid, (this.paginator.pageIndex + 1).toString(),
              this.paginator.pageSize.toString(), this.sort.active, this.sort.direction).pipe(
              tap(() => this.dictionarySize = this.dictMeta.dictionarySize)
            );
          }
        })
      )
  }

  ngOnDestroy() {
    this.destroy.next(null);
    this.destroy.complete();
  }

  /**
   * Получение записей справочника постранично
   * */
  getRecsPerPage(oid: string, page: string, pageSize: string,
                 sortColumn?: string, sortDir?: string): Observable<DictNode[]> {
    return this.dictService.getPerPage(oid, page, pageSize, sortColumn, sortDir).pipe(takeUntil(this.destroy));
  }

  /**
   * Получение записей справочника постранично c фильтрацией
   * */
  getRecsPerPageWithFilter(oid: string, page: string, pageSize: string, search: string,
                           sortColumn?: string, sortDir?: string): Observable<DictNode[]> {
    return this.dictService.getPerPageWithFilter(oid, page, pageSize, search, sortColumn, sortDir).pipe(takeUntil(this.destroy));
  }

  getAllDictionary(oid: string): Observable<DictNode[]> {
    if (this.allDictionary) {
      return this.allDictionary;
    } else {
      this.allDictionary = new ReplaySubject<DictNode[]>(1);
      return this.dictService.getLinearDictionary(oid).pipe(
        takeUntil(this.destroy),
        tap(dictionary => this.allDictionary.next(dictionary))
      )
    }
  }

  /** Выбрать все строки если они не все отмечены; в противном случае очистить выбор */
  masterToggle() {
    this.isAllSelected() ?
      this.selection.clear() :
      this.tableDataSource.data.forEach(row => this.selection.select(row));
  }

  selectNode(row) {
    const ind = this.findNodeIndex(row);
    if (ind === -1) {
      this.selection.select(row);
    } else {
      this.selection.deselect(this.selection.selected[ind]);
    }
  }

  findNodeIndex(node): number {
    return this.selection.selected.findIndex(item => {
      return item.id === node.id;
    });
  }

  selectEntries() {
    this.selected.emit(this.selection.selected);
  }

  getSelected() {
    if (this.data.ids[0]) {
      // если приходят ID записей, то получаем записи с бэка, иначе сразу добавляем записи в выбранные
      if (typeof this.data.ids[0] === 'number') {
        this.dictService.getByIDs(this.data.oid, this.data.ids).pipe(takeUntil(this.destroy))
          .subscribe(data => {
            data.forEach(node => {
              this.selection.select(node);
            });
          });
      } else {
        this.data.ids.forEach(node => {
          this.selection.select(node);
        });
      }
    }
  }

  remove(node): void {
    this.selection.deselect(node);
  }

  /** Когда количество выбранных элементов совпадает с общим количеством строк */
  isAllSelected() {
    const numSelected = this.selection.selected.length;
    const numRows = this.tableDataSource.data.length;
    return numSelected === numRows;
  }
}
