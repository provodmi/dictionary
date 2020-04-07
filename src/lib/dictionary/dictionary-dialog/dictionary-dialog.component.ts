import {Component, OnInit, Inject} from '@angular/core';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';

@Component({
  selector: 'app-dictionary-dialog',
  templateUrl: './dictionary-dialog.component.html',
  styleUrls: ['./dictionary-dialog.component.scss'],
  // providers: [{ provide: MAT_DIALOG_DEFAULT_OPTIONS, useValue: [{ hasBackdrop: false }, { disableClose: true }] }]
})
export class DictionaryDialogComponent implements OnInit {

  constructor(public dialogRef: MatDialogRef<DictionaryDialogComponent>,
              @Inject(MAT_DIALOG_DATA) public data) {}

  dictMeta;
  isLoading: boolean;
  unableLoad = false;

  isDictionaryHierarchical: boolean;

  ngOnInit() {
    this.dictMeta = this.data.dictMeta;
    this.isDictionaryHierarchical = this.dictMeta.type === 1;
  }

  /**
   * Выбор записи словаря
   * если режим многовыборочный - возвращается массив
   */
  select($event) {
    this.dialogRef.close($event.length === 1 ? $event[0] : $event);
  }
}
