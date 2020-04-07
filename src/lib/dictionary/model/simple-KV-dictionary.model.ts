export class SimpleKeyValueDictionary {
  id?: number;
  value: number | string;
  valueView: string;

  constructor(value, valueView) {
    this.value = value;
    this.valueView = valueView;
  }
}

export class DictView {
  id: number;
  name: string;
}
