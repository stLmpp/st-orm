export type Statement = [statement: string, params: any[]];

export interface Type<T = any> {
  new (...args: any[]): T;
}

export type RequiredBy<T, K extends keyof T> = Omit<T, K> & Required<Pick<T, K>>;
export type PartialBy<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

export type ConditionalKeys<Base, Condition> = NonNullable<
  {
    [Key in keyof Base]: Base[Key] extends Condition ? Key : never;
  }[keyof Base]
>;

export type ExcludeKeys<Base, Condition> = NonNullable<
  { [Key in keyof Base]: Base[Key] extends Condition ? never : Key }[keyof Base]
>;

export type ConditionalExclude<Base, Condition> = Exclude<Base, ExcludeKeys<Base, Condition>>;

export type ConditionalPick<Base, Condition> = Pick<Base, ConditionalKeys<Base, Condition>>;

export type Primitive = string | number | boolean | bigint | symbol | undefined | null;

export type PartialDeep<T> = T extends Date
  ? Date | string
  : T extends Primitive
  ? Partial<T>
  : T extends Map<infer KeyType, infer ValueType>
  ? PartialMapDeep<KeyType, ValueType>
  : T extends Set<infer ItemType>
  ? PartialSetDeep<ItemType>
  : T extends ReadonlyMap<infer KeyType, infer ValueType>
  ? PartialReadonlyMapDeep<KeyType, ValueType>
  : T extends ReadonlySet<infer ItemType>
  ? PartialReadonlySetDeep<ItemType>
  : T extends (...args: any[]) => unknown
  ? T | undefined
  : T extends Record<any, any>
  ? PartialObjectDeep<T>
  : unknown;

type PartialMapDeep<KeyType, ValueType> = Map<PartialDeep<KeyType>, PartialDeep<ValueType>>;
type PartialSetDeep<T> = Set<PartialDeep<T>>;
type PartialReadonlyMapDeep<KeyType, ValueType> = ReadonlyMap<PartialDeep<KeyType>, PartialDeep<ValueType>>;
type PartialReadonlySetDeep<T> = ReadonlySet<PartialDeep<T>>;
type PartialObjectDeep<ObjectType extends Record<any, any>> = {
  [KeyType in keyof ObjectType]?: PartialDeep<ObjectType[KeyType]>;
};

export interface FieldInfo {
  catalog: string;
  schema: string;
  table: string;
  originTable: string;
  name: string;
  originName: string;
  encoding: number;
  fieldLen: number;
  fieldType: number;
  fieldFlag: number;
  decimals: number;
  defaultVal: string;
}

export interface ExecuteResult {
  affectedRows?: number;
  lastInsertId?: number;
  fields?: FieldInfo[];
  rows?: any[];
}
