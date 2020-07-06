import {Inject, Injectable} from '@angular/core';
import {DictView} from '../model/simple-KV-dictionary.model';
import {Observable, of} from 'rxjs';
import {HttpClient, HttpParams} from '@angular/common/http';
import {catchError, map} from 'rxjs/operators';
import {DICTIONARY_CONFIG_TOKEN, DictionaryConfig, DictNode} from '../model/dictionary.model';

const url = 'http://stage.backend.digitalwords.io/dict-api';

@Injectable({providedIn: 'root'})
export class DictionaryService {

  constructor(private http: HttpClient,
              @Inject(DICTIONARY_CONFIG_TOKEN) private config: DictionaryConfig = {dictURL: url}) { }

  getViewByIds(oid: string, ids) {
    const params = {params: new HttpParams().set('id', ids)};
    return this.http.get<DictView[]>(`${this.config.dictURL}/dictionary/${oid}/list`, params);
  }

  /**
   * Получение массива записей IDs
   * @param oid
   * @param ids
   */
  getByIDs(oid: string, ids): Observable<DictNode[]> {
    return this.http.post<DictNode[]>(`${this.config.dictURL}/dictionary/data/${oid}/ids/`, ids);
  }

  /**
   * Получение всех записей словаря, постранично (10)
   * @param oid OID Словаря
   * @param pageSize размер страницы
   * @param page страница
   * @param sortColumn колонка для сортировки
   * @param sortDir направление сортировки
   * */
  getPerPage(oid: string, page: string, pageSize?: string, sortColumn?: string, sortDir?: string): Observable<DictNode[]> {
    return this.http.get<DictNode[]>(`${this.config.dictURL}/dictionary/data/${oid}/from/${pageSize ? pageSize : '10'}
           /${page}/${sortColumn ? sortColumn + (sortDir !== 'desc' ? '/1' : '/0') : ''}`).pipe(
      catchError(() => of([]))
    );
  }

  /**
   * Получение отфильтрованных записей словаря, постранично (10)
   * @param oid OID Словаря
   * @param pageSize размер страницы
   * @param page страница
   * @param search - строка поиска
   * @param sortColumn колонка для сортировки
   * @param sortDir направление сортировки
   * */
   getPerPageWithFilter(oid: string, page: string, pageSize: string, search: string, sortColumn?: string, sortDir?: string): Observable<DictNode[]> {
    return this.http.get<DictNode[]>(`${this.config.dictURL}/dictionary/data/${oid}/from/${pageSize}
           /${page}/${search}/${sortColumn ? sortColumn + (sortDir !== 'desc' ? '/1' : '/0') : ''}`).pipe(
             catchError(() => of([]))
    );
  }

  /**
   * Получение всех записей словаря (целиком)
   * @param oid
   */
  getLinearDictionary(oid): Observable<DictNode[]> {
    return this.http.get<DictNode[]>(`${this.config.dictURL}/dictionary/data/${oid}/`);
  }

  /**
   * Получение записи словаря
   * @param oid OID Словаря
   * @param id ID Записи словаря
   */
  getById(oid: string, id: number): Observable<DictNode> {
    return this.http.get<DictNode>(`${this.config.dictURL}/dictionary/data/${oid}/${id}/`).pipe(
      catchError(() => of(null))
    );
  }

  /**
   * Получение записей словаря по родителю
   * @param oid OID Словаря
   * @param pid ID родителя
   */
  getByParentId(oid: string, pid?: number): Observable<DictNode[]> {
    return this.http.get<DictNode[]>(`${this.config.dictURL}/dictionary/data/${oid}/from/${pid !== undefined ? pid : '0'}/`);
  }

  getByNameHierarchicalDic(oid: string, name: string): Observable<DictNode[]> {
    return this.http.post<DictNode[]>(`${this.config.dictURL}/dictionary/like/${oid}/`, name).pipe(
      catchError(() => of([]))
    );
  }

  displayFn(dictVal): string | undefined {
    return dictVal ? dictVal.name : undefined;
  }

  getMetadataByOID(oid: string): Observable<any> {
    return this.http.get<any>(`${this.config.dictURL}/dictionary/description/${oid}/`);
  }

  /**
   * Метод преобразует строку на латинице в строку на кирилице
   * Можно использовать, только если поиск никогда не осуществляется на английском языке
   * @param str - строка для преобразования
   */
  autoLayoutKeyboard(str): string {
    const replacer = {
      'q': 'й', 'w': 'ц', 'e': 'у', 'r': 'к', 't': 'е', 'y': 'н', 'u': 'г',
      'i': 'ш', 'o': 'щ', 'p': 'з', '[': 'х', ']': 'ъ', 'a': 'ф', 's': 'ы',
      'd': 'в', 'f': 'а', 'g': 'п', 'h': 'р', 'j': 'о', 'k': 'л', 'l': 'д',
      ';': 'ж', '\'': 'э', 'z': 'я', 'x': 'ч', 'c': 'с', 'v': 'м', 'b': 'и',
      'n': 'т', 'm': 'ь', ',': 'б', '.': 'ю', '/': '.'
    };
    if (str.match(/\w/g)) {
      return str.replace(/[A-z/,.;\]\'\[]/g, (x) => {
        return x === x.toLowerCase() ? replacer[x] : replacer[x.toLowerCase()].toUpperCase();
      });
    } else {
      return str;
    }
  }

  fixKeyboardLayout = () => (source: Observable<string>) => source.pipe(
    map(val => {
      if (typeof val === 'string') {
        val = val.trim();
        if (val && val.match(/^[A-z\s\/,.;\]'\[]*$/)) {
          return this.autoLayoutKeyboard(val);
        } else {
          return val;
        }
      } else {
        return val;
      }
    })
  );

  /**
   * получения словаря
   * @param oid
   * @param params если словарь требует параметры (эта информация приходит в метаданных словаря)
   */
  getHierarchicalDictionary(oid, params = {}): Observable<DictNode[]> {
    return this.http.post<DictNode[]>(`${this.config.dictURL}/dictionary/data/${oid}/`, params).pipe(
      catchError(() => of([]))
    );
  }

  getByNameOrNameAndParams(oid, params = {}, search: string): Observable<DictNode[]> {
    params = {search, ...params};
    return this.http.post<DictNode[]>(`${this.config.dictURL}/dictionary/autocomplete/${oid}/`, params).pipe(
      catchError(() => of([]))
    );
  }
}
