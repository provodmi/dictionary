import {NestedTreeControl} from '@angular/cdk/tree';
import {CollectionViewer, SelectionChange, SelectionModel} from '@angular/cdk/collections';
import {Component, EventEmitter, Inject, Injectable, Input, OnDestroy, OnInit, Output} from '@angular/core';
import {BehaviorSubject, combineLatest, merge, Observable, of, ReplaySubject} from 'rxjs';
import {DictionaryService} from '../service/dictionary.service';
import {debounceTime, delay, map, switchMap, takeUntil, timeout} from 'rxjs/operators';
import {FormControl} from '@angular/forms';
import {DICTIONARY_CONFIG_TOKEN, DictionaryConfig, DictNode} from "../model/dictionary.model";
import {animate, style, transition, trigger} from "@angular/animations";

@Injectable()
export class DynamicDatabase implements OnDestroy {

  destroy: ReplaySubject<any> = new ReplaySubject<any>(1);

  oid: string;

  constructor(public dictService: DictionaryService) {
  }

  /** Initial data from dictionary */
  initialData(oid: string): Observable<any> {
    this.oid = oid;
    return this.getByParentId();
  }

  getNodeByIDs(oid, ids: number[]): Observable<DictNode[]> {
    return combineLatest(ids.map(num => this.dictService.getById(oid, num).pipe(
      takeUntil(this.destroy)
    )));
  }

  getChildren(node: DictNode): Observable<DictNode[]> {
    return this.getByParentId(node.id, node);
  }

  getByParentId(pid?: number, node?: DictNode): Observable<DictNode[]> {
    return this.dictService.getByParentId(this.oid, pid ? pid : 0).pipe(
      map(data => {
        return data.map(item => {
          item.parent = node;
          return item;
        });
      })
    );
  }

  ngOnDestroy(): void {
    this.destroy.next(null);
    this.destroy.complete();
  }
}

@Component({
  selector: 'app-hierarchical-dynamic-dictionary',
  templateUrl: './hierarchical-dynamic-dictionary.component.html',
  styleUrls: ['./hierarchical-dynamic-dictionary.component.scss'],
  providers: [DynamicDatabase],
  // animations: [
  //   trigger('showAnimation', [
  //     transition('true => false', [
  //       animate('0.15s linear', style({filter:'none'}))
  //     ]),
  //     transition('false => true', [
  //       animate('0.15s linear', style({filter: 'blur(3px)'}))
  //     ])
  //   ])
  // ]
})
export class HierarchicalDynamicDictionaryComponent implements OnInit, OnDestroy {

  @Input() data;
  @Input() dictMeta;

  @Output() selected = new EventEmitter<any[]>();

  // Цвет, в который окрашиваются результаты поиска по словарю
  resultColor = 'yellow';

  destroy: ReplaySubject<any> = new ReplaySubject<any>(1);
  checklistSelection: SelectionModel<DictNode>;
  isLoading: boolean;
  searchInput: FormControl = new FormControl('');
  dynDictionary: DictNode[];

  treeControl: NestedTreeControl<DictNode>;
  dataSource: DynamicDataSource;
  isExpandable = (node: DictNode) => node.expandable;

  hasChild = (_: number, node: DictNode) => node.expandable;

  constructor(private database: DynamicDatabase,
              private ds: DictionaryService,
              @Inject(DICTIONARY_CONFIG_TOKEN) private config: DictionaryConfig) {
    if (config.resultColor) {
      this.resultColor = config.resultColor;
    }
    this.initTree();
  }

  identify(index, item) {
    return item.id;
  };

  initTree() {
    this.treeControl = new NestedTreeControl<DictNode>(node => node.children);
    this.dataSource = new DynamicDataSource(this.treeControl, this.database, this);
  }

  refreshTreeControl() {
    this.dataSource._treeControl = new NestedTreeControl<DictNode>(node => node.children);
  }

  fillTree() {
    this.database.initialData(this.data.oid)
      .pipe(takeUntil(this.destroy))
      .subscribe(data => {
        this.dynDictionary = data;
        this.dataSource.data = data;
        this.isLoading = false;
      });
  }

  ngOnInit() {
    this.checklistSelection = new SelectionModel<DictNode>(this.dictMeta.multiSelection);
    setTimeout(() => {
      this.isLoading = this.isLoading !== false;
    }, 500);
    if (this.data.ids[0]) {
      this.database.getNodeByIDs(this.data.oid, this.data.ids)
        .subscribe((data) => {
          data.forEach(node => {
            this.checklistSelection.select(node);
          });
        });
    }

    this.fillTree();

    this.searchInput.valueChanges.pipe(
      debounceTime(500),
      this.database.dictService.fixKeyboardLayout(),
      switchMap(searchStr => {
        this.searchInput.setValue(searchStr, {emitEvent: false});
        this.isLoading = true;
        if (searchStr.length > 2) {
          return this.database.dictService.getByNameHierarchicalDic(this.data.oid, searchStr).pipe(
            map(result => {
              if (result.length) {
                if (result.length > 150) {
                  this.searchInput.setErrors({'tooBigResult': true});
                  this.searchInput.markAsTouched();
                  return this.dynDictionary;
                } else {
                  this.searchInput.setErrors(null);
                  return this.makeTreeDictionary(result.reverse());
                }
              } else {
                this.searchInput.setErrors({'notFound': true});
                this.searchInput.markAsTouched();
                return result;
              }
            })
          )
        } else {
          this.searchInput.setErrors(null);
          return of(this.dynDictionary);
        }
      }),
      takeUntil(this.destroy)
    ).subscribe((result) => {
      this.isLoading = false;
      this.refreshTreeControl();
      this.dataSource.data = result;
      this.expandDescendants(this.dataSource.data);
    }, err => {
      this.isLoading = false;
    });
  }


  isNodeSelected(node: DictNode): boolean {
    if (this.checklistSelection.isSelected(node)) {
      return true;
    } else if (this.checklistSelection.selected.find(({id}) => node.id === id)) {
      const ind = this.checklistSelection.selected.findIndex(({id}) => node.id === id);
      const previousVal = this.checklistSelection.selected;
      this.checklistSelection.deselect(...this.checklistSelection.selected);
      previousVal.splice(ind, 1, node);
      this.checklistSelection.select(...previousVal);
      return true;
    } else {
      return false;
    }
  }

  ngOnDestroy(): void {
    this.destroy.next(null);
    this.destroy.complete();
  }

  /** Whether all the descendants of the node are selected. */
  descendantsAllSelected(node: DictNode): boolean {
    const children = this.treeControl.getChildren(node);
    return !!children && (<DictNode[]>children).every(child =>
      this.checklistSelection.isSelected(child)
    );
  }

  /** Whether part of the descendants are selected */
  descendantsPartiallySelected(node: DictNode): boolean {
    const children = this.treeControl.getChildren(node);
    const result = !!children && (<DictNode[]>children).some(child =>
      this.checklistSelection.isSelected(child)
    );
    return result && !this.descendantsAllSelected(node);
  }


  /** Toggle the to-do item selection. Select/deselect all the descendants node */
  todoItemSelectionToggle(node: DictNode): void {
    this.checklistSelection.toggle(node);
    const children = this.treeControl.getChildren(node);
    this.checklistSelection.isSelected(node)
      ? this.checklistSelection.select(...(<DictNode[]>children))
      : this.checklistSelection.deselect(...(<DictNode[]>children));

    // Force update for the parent
    (<DictNode[]>children).every(child =>
      this.checklistSelection.isSelected(child)
    );
    this.checkAllParentsSelection(node);
  }

  /** Toggle a leaf to-do item selection. Check all the parents to see if they changed */
  todoLeafItemSelectionToggle(node: DictNode): void {
    this.checklistSelection.toggle(node);
    // this.checkAllParentsSelection(node);
  }

  /* Checks all the parents when a leaf node is selected/unselected */
  checkAllParentsSelection(node: DictNode): void {
    let parent: DictNode | null = this.getParentNode(node);
    while (parent) {
      this.checkRootNodeSelection(parent);
      parent = this.getParentNode(parent);
    }
  }

  expandAllParents(node: DictNode): void {
    let parent: DictNode | null = this.getParentNode(node);
    while (parent) {
      this.treeControl.expand(parent);
      parent = this.getParentNode(parent);
    }
  }

  /** Check root node checked state and change it accordingly */
  checkRootNodeSelection(node: DictNode): void {
    const nodeSelected = this.checklistSelection.isSelected(node);
    const children = this.treeControl.getChildren(node);
    const childrenAllSelected = (<DictNode[]>children).every(child =>
      this.checklistSelection.isSelected(child)
    );
    if (nodeSelected && !childrenAllSelected) {
      this.checklistSelection.deselect(node);
    } else if (!nodeSelected && childrenAllSelected) {
      this.checklistSelection.select(node);
    }
  }

  /* Get the parent node of a node */
  getParentNode(node: DictNode): DictNode | null {
    if (node.parent !== undefined) {
      return node.parent;
    } else {
      return null;
    }
  }

  remove(node: DictNode): void {
    this.checklistSelection.deselect(node);
  }

  colorTheLines(substr: string, dict: DictNode[]) {
    if (this.searchInput.value) {
      dict.forEach(node => {
        if (node.expandable && node.children) {
          this.colorTheLines(substr, node.children);
        }
        this.colorLine(node, substr);
      });
    }
  }

  colorLine(node: DictNode, substr: string) {
    let pos = 0;
    const parElem = document.getElementById(node.id.toString());
    if (parElem) {
      const elemArray = parElem.getElementsByTagName('span');
      while (pos < node.name.length) {
        const foundPos = node.name.toLowerCase().indexOf(substr.toLowerCase(), pos);
        if (foundPos === -1) {
          break;
        }
        for (let i = foundPos; i < foundPos + substr.length; i++) {
          elemArray[i].style.background = this.resultColor;
        }
        pos = foundPos + substr.length;
      }
    }
  }

  makeTreeDictionary(dict: DictNode[]): DictNode[] {
    const result = [];
    dict.forEach(node => {
      if (node.parentId) {
        const parentId = dict.findIndex(o => o.id === node.parentId);
        node.parent = dict[parentId];
        dict[parentId].children ? dict[parentId].children.unshift(node) : dict[parentId].children = [node];
        dict[parentId].expandable = true;
      } else {
        result.unshift(node);
      }
    });
    return result;
  }

  expandDescendants(dict: DictNode[]) {
    dict.forEach(node => {
      if (node.expandable && node.children && node.children.length) {
        this.treeControl.expand(node);
        this.expandDescendants(node.children);
      }
    });
    // this.colorTheLines(this.searchInput.value, this.dataSource.data);
  }

  /**
   * метод удаляет из выбранных записи закрываемого узла
   * @param node
   */
  resetSelected(node: DictNode) {
    if (!this.treeControl.isExpanded(node)) {
      const children = this.treeControl.getDescendants(node);
      children.forEach(item => {
        if (this.checklistSelection.isSelected(item)) {
          this.checklistSelection.deselect(item);
        }
      });
    }
  }

  getSelected(): Observable<any> {
    return this.database.getNodeByIDs(this.data.oid, this.checklistSelection.selected.map(node => node.id));
  }

  select() {
    this.getSelected()
      .pipe(takeUntil(this.destroy))
      .subscribe(data => {
        this.selected.emit(data);
      });
  }

  showNodeInTree(node: DictNode) {
    if (this.searchInput.value && this.searchInput.value === node.name) {
      this.searchInput.reset('');
    } else {
      this.searchInput.setValue(node.name);
    }
  }
}

@Injectable()
export class DynamicDataSource implements OnDestroy {

  dataChange = new BehaviorSubject<DictNode[]>([]);
  destroy: ReplaySubject<any> = new ReplaySubject<any>(1);

  get data(): DictNode[] {
    return this.dataChange.value;
  }

  set data(value: DictNode[]) {
    this._treeControl.dataNodes = value;
    this.dataChange.next(value);
  }

  constructor(public _treeControl: NestedTreeControl<DictNode>,
              private _database: DynamicDatabase,
              private mainComp: HierarchicalDynamicDictionaryComponent) {
  }

  ngOnDestroy(): void {
    this.destroy.next(null);
    this.destroy.complete();
  }

  connect(collectionViewer: CollectionViewer): Observable<DictNode[]> {
    this._treeControl.expansionModel.changed
      .pipe(takeUntil(this.destroy))
      .subscribe(change => {
        if ((change as SelectionChange<DictNode>).added ||
          (change as SelectionChange<DictNode>).removed) {
          this.handleTreeControl(change as SelectionChange<DictNode>);
        }
      });

    return merge(collectionViewer.viewChange, this.dataChange).pipe(map(() => this.data));
  }

  /** Handle expand/collapse behaviors */
  handleTreeControl(change: SelectionChange<DictNode>) {
    if (change.added.length) {
      change.added.forEach(node => {
        this.toggleNode(node, true);
      });
    }
    if (change.removed.length) {
      change.removed.slice().reverse().forEach(node => this.toggleNode(node, false));
    }
  }

  toggleNode(node: DictNode, expand: boolean) {
    if (node.expandable) {
      if (expand) {
        if (!node.children) {
          let opened = false;
          setTimeout(() => {
            if (!opened) {
              node.isLoading = true;
            }
          }, 100);
          this._database.getChildren(node)
            .pipe(takeUntil(this.destroy))
            .subscribe(data => {
              opened = true;
              node.isLoading = false;
              node.children = data;
              this.refreshData();
              this.mainComp.colorTheLines(this.mainComp.searchInput.value, this.mainComp.dataSource.data);
            });
        } else {
          setTimeout(() => this.mainComp.colorTheLines(this.mainComp.searchInput.value, this.mainComp.dataSource.data), 25);
        }
      } else {
        // delete node.children;
      }
    }
  }

  refreshData() {
    const temp = this.data;
    this.data = null;
    this.data = temp;
    this.dataChange.next(this.data);
  }
}
