import {ModuleWithProviders, NgModule} from '@angular/core';
import {DictionaryService} from "./service/dictionary.service";
import {DictionaryDialogComponent} from "./dictionary-dialog/dictionary-dialog.component";
import {LinearDictionaryComponent} from "./linear-dictionary/linear-dictionary.component";
import {HierarchicalDictionaryComponent} from "./hierarchical-dictionary/hierarchical-dictionary.component";
import {HierarchicalDynamicDictionaryComponent} from "./hierarchical-dynamic-dictionary/hierarchical-dynamic-dictionary.component";
import {DictionaryInputComponent} from "./dictionary-input/dictionary-input.component";
import {ChipsAutocompleteComponent} from "./chips-autocomplete/chips-autocomplete.component";
import {MatAutocompleteModule} from "@angular/material/autocomplete";
import {MatButtonModule} from "@angular/material/button";
import {MatCardModule} from "@angular/material/card";
import {MatCheckboxModule} from "@angular/material/checkbox";
import {MatChipsModule} from "@angular/material/chips";
import {MatFormFieldModule} from "@angular/material/form-field";
import {MatPaginatorModule} from "@angular/material/paginator";
import {MatProgressBarModule} from "@angular/material/progress-bar";
import {MatProgressSpinnerModule} from "@angular/material/progress-spinner";
import {MatTableModule} from "@angular/material/table";
import {MatTooltipModule} from "@angular/material/tooltip";
import {MatTreeModule} from "@angular/material/tree";
import {CommonModule} from "@angular/common";
import {DICTIONARY_CONFIG_TOKEN, DictionaryConfig} from "./model/dictionary.model";
import {MatDialogModule} from "@angular/material/dialog";
import {MatInputModule} from "@angular/material/input";
import {MatIconModule} from "@angular/material/icon";
import {MatSortModule} from "@angular/material/sort";
import {ReactiveFormsModule} from "@angular/forms";

@NgModule({
  declarations: [LinearDictionaryComponent, HierarchicalDictionaryComponent, HierarchicalDynamicDictionaryComponent,
    DictionaryInputComponent, ChipsAutocompleteComponent, DictionaryDialogComponent],
  imports: [
    CommonModule,
    ReactiveFormsModule,

    MatFormFieldModule,
    MatChipsModule,
    MatTooltipModule,
    MatAutocompleteModule,
    MatProgressSpinnerModule,
    MatCardModule,
    MatTreeModule,
    MatCheckboxModule,
    MatProgressBarModule,
    MatButtonModule,
    MatTableModule,
    MatPaginatorModule,
    MatDialogModule,
    MatInputModule,
    MatIconModule,
    MatSortModule
  ],
  exports: [LinearDictionaryComponent, HierarchicalDictionaryComponent, HierarchicalDynamicDictionaryComponent,
    DictionaryInputComponent, ChipsAutocompleteComponent, DictionaryDialogComponent],
  entryComponents: [DictionaryDialogComponent],
  providers: [DictionaryService]
})
export class DictionaryModule {
  static forRoot(config: DictionaryConfig): ModuleWithProviders {
    return {
      ngModule: DictionaryModule,
      providers: [
        { provide: DICTIONARY_CONFIG_TOKEN, useValue: config }
      ]
    };
  }
}
