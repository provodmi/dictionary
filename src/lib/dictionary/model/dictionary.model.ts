import {InjectionToken} from "@angular/core";

export class DictNode {
  id: number;
  name: string;
  externalName: string;
  [key: string]: any;
  oid: string;
  parentId?: number;
  children?: DictNode[];
  parent?: DictNode;
  expandable?: boolean;
  isLoading?: boolean;
}

export interface DictionaryConfig {
  dictURL: string;
  resultColor?: string;
  behavior?: ScrollBehavior;
  objectAsOutputData?: boolean;
}

export const DICTIONARY_CONFIG_TOKEN = new InjectionToken<DictionaryConfig>('unique.string.for.config');
