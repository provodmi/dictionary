import {SelectionModel} from '@angular/cdk/collections';
import {FlatTreeControl} from '@angular/cdk/tree';
import {Component, EventEmitter, Inject, Input, OnDestroy, OnInit, Output} from '@angular/core';
import {MatTreeFlatDataSource, MatTreeFlattener} from '@angular/material/tree';
import {Observable, ReplaySubject, Subject, Subscription} from 'rxjs';
import {debounceTime, distinctUntilChanged, map, takeUntil} from 'rxjs/operators';
import {HttpClient} from '@angular/common/http';
import {FormControl} from '@angular/forms';
import {DictionaryService} from "../service/dictionary.service";
import {DICTIONARY_CONFIG_TOKEN, DictionaryConfig, DictNode} from "../model/dictionary.model";

/** Узел с информацией о расширяемости и уровне */
export class FlatNode {
  expandable: boolean;
  name: string;
  level: number;
  id: number;
  pid: number;
}

/**
 * @title Tree with checkboxes
 */
@Component({
  selector: 'app-hierarchical-dictionary',
  templateUrl: './hierarchical-dictionary.component.html',
  styleUrls: ['./hierarchical-dictionary.component.scss'],
  // providers: [ChecklistDatabase]
})

export class HierarchicalDictionaryComponent implements OnInit, OnDestroy {

  @Input() data;
  @Input() dictMeta;
  @Output() selected = new EventEmitter<any[]>();

  // Поведение перемотки на нужную запись. 'smooth' or 'auto'
  behavior: ScrollBehavior = 'auto';
  // Цвет, в который окрашиваются результаты поиска по словарю
  resultColor = 'yellow';

  /** Map from flat node to nested node. This helps us finding the nested node to be modified */
  flatNodeMap = new Map<FlatNode, DictNode>();

  /** Map from nested node to flattened node. This helps us to keep the same object for selection */
  nestedNodeMap = new Map<DictNode, FlatNode>();

  destroy: ReplaySubject<any> = new ReplaySubject<any>(1);

  isLoading = true;
  dictionary: DictNode[];
  treeDictionary: DictNode[];
  searchInput: FormControl = new FormControl('');


  checklistSelection: SelectionModel<FlatNode>;

  treeControl: FlatTreeControl<FlatNode>;

  treeFlattener: MatTreeFlattener<DictNode, FlatNode>;

  dataSource: MatTreeFlatDataSource<DictNode, FlatNode>;

  identify(index, item) {
    return item.id;
  };

  constructor(private http: HttpClient,
              private dictService: DictionaryService,
              @Inject(DICTIONARY_CONFIG_TOKEN) private config: DictionaryConfig) {
    if (config.resultColor) {
      this.resultColor = config.resultColor;
    }
    if (config.behavior) {
      this.behavior = config.behavior;
    }
    this.treeFlattener = new MatTreeFlattener(this.transformer, this.getLevel,
      this.isExpandable, this.getChildren);
    this.treeControl = new FlatTreeControl<FlatNode>(this.getLevel, this.isExpandable);
    this.dataSource = new MatTreeFlatDataSource(this.treeControl, this.treeFlattener);
  }

  ngOnInit() {
    this.checklistSelection = new SelectionModel<FlatNode>(this.data.dictMeta.multiSelection /* multiple */);
    this.loadWholeDictionary(this.data.oid)
      .pipe(takeUntil(this.destroy))
      .subscribe(res => {
        this.isLoading = false;
        this.dataSource.data = res;
        this.treeDictionary = res;
        if (this.data.ids[0]) {
          this.data.ids.forEach(id => {
            const ind = this.treeControl.dataNodes.findIndex(node => node.id === id);
            if (ind !== -1) {
              const node = this.treeControl.dataNodes[ind];
              if (node) {
                if (node.expandable) {
                  this.dictMeta.multiSelection ? this.todoItemSelectionToggle(node) : this.todoLeafItemSelectionToggle(node);
                } else {
                  this.todoLeafItemSelectionToggle(node);
                }
                this.expandAllParents(node);
              }
            }
          });
          setTimeout(() => {
            const elem = document.getElementById(`${this.data.ids[0]}`);
            if (elem) {
              elem.scrollIntoView({behavior: this.behavior, block: 'center'});
            }
          }, 400);
        }
      });
    this.searchInput.valueChanges.pipe(
      debounceTime(500),
      distinctUntilChanged(),
      this.dictService.fixKeyboardLayout(),
      takeUntil(this.destroy)
    ).subscribe(searchStr => {
      if (searchStr) {
        this.expandAndColorMatchNodes(searchStr);
      } else {
        this.treeControl.dataNodes.forEach(node => this.clearLine(node));
        this.treeControl.collapseAll();
      }
    });
  }

  ngOnDestroy(): void {
    this.destroy.next(null);
    this.destroy.complete();
  }

  getLevel = (node: FlatNode) => node.level;

  isExpandable = (node: FlatNode) => node.expandable;

  getChildren = (node: DictNode): DictNode[] => node.children;

  hasChild = (_: number, _nodeData: FlatNode) => _nodeData.expandable;

  hasNoContent = (_: number, _nodeData: FlatNode) => _nodeData.name === '';

  /**
   * Transformer to convert nested node to flat node. Record the nodes in maps for later use.
   */
  transformer = (node: DictNode, level: number) => {
    const existingNode = this.nestedNodeMap.get(node);
    const flatNode = existingNode && existingNode.name === node.name
      ? existingNode
      : new FlatNode();
    flatNode.name = node.name;
    flatNode.level = level;
    flatNode.expandable = !!node.children;
    flatNode.id = node.id;
    flatNode.pid = node.parentId;
    this.flatNodeMap.set(flatNode, node);
    this.nestedNodeMap.set(node, flatNode);
    return flatNode;
  }

  /** Whether all the descendants of the node are selected. */
  descendantsAllSelected(node: FlatNode): boolean {
    const descendants = this.treeControl.getDescendants(node);
    const descAllSelected = descendants.every(child =>
      this.checklistSelection.isSelected(child)
    );
    return descAllSelected;
  }

  /** Whether part of the descendants are selected */
  descendantsPartiallySelected(node: FlatNode): boolean {
    const descendants = this.treeControl.getDescendants(node);
    const result = descendants.some(child => this.checklistSelection.isSelected(child));
    return result && !this.descendantsAllSelected(node);
  }

  /** Toggle the to-do item selection. Select/deselect all the descendants node */
  todoItemSelectionToggle(node: FlatNode): void {
    this.checklistSelection.toggle(node);
    const descendants = this.treeControl.getDescendants(node);
    this.checklistSelection.isSelected(node) && this.data.dictMeta.multiSelection
      ? this.checklistSelection.select(...descendants)
      : this.checklistSelection.deselect(...descendants);

    // Force update for the parent
    descendants.every(child =>
      this.checklistSelection.isSelected(child)
    );
    this.checkAllParentsSelection(node);
  }

  /** Toggle a leaf to-do item selection. Check all the parents to see if they changed */
  todoLeafItemSelectionToggle(node: FlatNode): void {
    this.checklistSelection.toggle(node);
    // this.checkAllParentsSelection(node);
  }

  /* Checks all the parents when a leaf node is selected/unselected */
  checkAllParentsSelection(node: FlatNode): void {
    let parent: FlatNode | null = this.getParentNode(node);
    while (parent) {
      this.checkRootNodeSelection(parent);
      parent = this.getParentNode(parent);
    }
  }

  expandAllParents(node: FlatNode): void {
    let parent: FlatNode | null = this.getParentNode(node);
    while (parent) {
      this.treeControl.expand(parent);
      parent = this.getParentNode(parent);
    }
  }

  /** Check root node checked state and change it accordingly */
  checkRootNodeSelection(node: FlatNode): void {
    const nodeSelected = this.checklistSelection.isSelected(node);
    const descendants = this.treeControl.getDescendants(node);
    const descAllSelected = descendants.every(child =>
      this.checklistSelection.isSelected(child)
    );
    if (nodeSelected && !descAllSelected) {
      this.checklistSelection.deselect(node);
    } else if (!nodeSelected && descAllSelected) {
      this.checklistSelection.select(node);
    }
  }

  /* Get the parent node of a node */
  getParentNode(node: FlatNode): FlatNode | null {
    const currentLevel = this.getLevel(node);

    if (currentLevel < 1) {
      return null;
    }

    const startIndex = this.treeControl.dataNodes.indexOf(node) - 1;

    for (let i = startIndex; i >= 0; i--) {
      const currentNode = this.treeControl.dataNodes[i];

      if (this.getLevel(currentNode) < currentLevel) {
        return currentNode;
      }
    }
    return null;
  }

  loadWholeDictionary(oid: string): Observable<DictNode[]> {
    return this.dictService.getHierarchicalDictionary(oid, this.getObjectOfParams()).pipe(map(data => {
      this.dictionary = data;
      return this.makeTreeDictionary(data.slice().reverse());
    }));
  }

  getObjectOfParams(): any {
    const params = {};
    this.data.dictMeta.parameters.forEach(param => {
      if (this.data.form[param.fieldName]) {
        params[param.fieldName] = this.data.form[param.fieldName];
      }
    });
    return params;
  }

  makeTreeDictionary(dict: DictNode[]): DictNode[] {
    const result = [];
    dict.forEach(node => {
      if (node.parentId) {
        const pind = dict.findIndex(o => o.id === node.parentId);
        if (pind === -1) {
          result.unshift(node);
        } else {
          dict[pind].children ? dict[pind].children.unshift(node) : dict[pind].children = [node];
          dict[pind].expandable = true;
        }
      } else {
        result.unshift(node);
      }
    });
    return result;
  }

  expandAndColorMatchNodes(searchStr: string) {
    let firstRes: FlatNode;
    this.treeControl.collapseAll();
    this.treeControl.dataNodes.forEach(node => {
      if (node.name.toLowerCase().indexOf(searchStr.toLowerCase()) !== -1) {
        this.expandAllParents(node);
        firstRes = firstRes ? firstRes : node;
        this.clearLine(node);
        this.colorLine(node, searchStr);
      } else {
        this.clearLine(node);
      }
    });
    if (firstRes) {
      document.getElementById(firstRes.id.toString()).scrollIntoView({behavior: this.behavior, block: 'center'});
    }
  }

  colorLine(node: FlatNode, substr: string) {
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

  clearLine(node: FlatNode) {
    if (node.level === 0 || this.treeControl.isExpanded(this.getParentNode(node))) {
      const parElem = document.getElementById(node.id.toString());
      if (parElem) {
        const elemArray = parElem.getElementsByTagName('span');
        for (let i = 0; i < elemArray.length; i++) {
          elemArray[i].style.background = 'transparent';
        }
      }
    }
  }

  // filterNode(node: DictNode, keyword: string): DictNode {
  //   if (node.expandable) {
  //     const result = node.children.map(leaf => this.filterNode(leaf, keyword)).filter(d => d !== undefined);
  //     if (result.length) {
  //       node.children = result;
  //       return node;
  //     } else {
  //       if (node.name.toLowerCase().indexOf(keyword.trim().toLowerCase()) !== -1) {
  //         return node;
  //       }
  //     }
  //   } else if (node.name.toLowerCase().indexOf(keyword.trim().toLowerCase()) !== -1) {
  //     return node;
  //   }
  // }

  getSelected(): Observable<any> {
    return this.dictService.getByIDs(this.data.oid, this.checklistSelection.selected.map(data => data.id));
  }

  remove(node: FlatNode): void {
    this.checklistSelection.deselect(node);
  }

  select() {
    this.getSelected()
      .pipe(takeUntil(this.destroy))
      .subscribe(data => {
        this.selected.emit(data);
      });
  }
}
