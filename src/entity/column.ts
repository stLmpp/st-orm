import { ReflectMetadata, ReflectMetadataTypes } from '../store/meta.ts';
import { isArray, isDate, isNullOrUndefined, isNumber, isString } from 'is-what';
import { entityStore } from '../store/entity-store.ts';
import { applyDecorators } from '../shared/util.ts';
import { IndexMetadata } from './indexes.ts';

export interface ColumnOptions {
  propertyKey?: string;
  name?: string;
  type?: ColumnType;
  length?: number;
  nullable?: boolean;
  select?: boolean;
  generated?: ColumnGenerated;
  defaultValue?: any;
  defaultRaw?: string;
  primary?: boolean;
  unique?: boolean;
  precision?: number;
  scale?: number;
  zerofill?: boolean;
  unsigned?: boolean;
  enumValue?: any;
  comment?: string;
  collate?: string;
}

export interface ColumnMetadata extends ColumnOptions {
  typeTs?: any;
  indexes?: IndexMetadata[];
}

export enum ColumnGenerated {
  increment = 'auto_increment',
  uuid = 'uuid',
}

const COLUMN_OPTIONS_DEFAULT: ColumnOptions = {
  select: true,
};

export function Column(): PropertyDecorator;
export function Column(type: ColumnType, options?: ColumnOptions): PropertyDecorator;
export function Column(options: ColumnOptions): PropertyDecorator;
export function Column(typeOrOptions?: ColumnType | ColumnOptions, options?: ColumnOptions): PropertyDecorator {
  let metadata: ColumnMetadata = { ...COLUMN_OPTIONS_DEFAULT, ...options };
  if (isString(typeOrOptions)) {
    metadata.type = typeOrOptions;
  } else {
    metadata = { ...metadata, ...typeOrOptions };
  }
  return (target, propertyKey) => {
    metadata.typeTs = ReflectMetadata.getMetadata(ReflectMetadataTypes.designType, target, propertyKey);
    if (!metadata.type) {
      metadata.type = resolveMySqlType(metadata.typeTs);
    }
    if (!metadata.name) {
      metadata.name = propertyKey.toString();
    }
    metadata.propertyKey = propertyKey.toString();
    entityStore.upsertColumn(target.constructor, metadata.propertyKey, metadata);
  };
}

export function PrimaryColumn(): PropertyDecorator;
export function PrimaryColumn(type: ColumnType, options?: ColumnOptions): PropertyDecorator;
export function PrimaryColumn(options: ColumnOptions): PropertyDecorator;
export function PrimaryColumn(typeOrOptions?: ColumnType | ColumnOptions, options?: ColumnOptions): PropertyDecorator {
  let metadata: ColumnMetadata = { ...COLUMN_OPTIONS_DEFAULT, ...options };
  if (isString(typeOrOptions)) {
    metadata.type = typeOrOptions;
  } else {
    metadata = { ...metadata, ...typeOrOptions };
  }
  metadata.primary = true;
  return applyDecorators(Column(metadata));
}

export function PrimaryGeneratedColumn(): PropertyDecorator;
export function PrimaryGeneratedColumn(generator: ColumnGenerated, options?: ColumnOptions): PropertyDecorator;
export function PrimaryGeneratedColumn(options: ColumnOptions): PropertyDecorator;
export function PrimaryGeneratedColumn(
  typeOrOptions?: ColumnGenerated | ColumnOptions,
  options?: ColumnOptions
): PropertyDecorator {
  let metadata: ColumnMetadata = { ...COLUMN_OPTIONS_DEFAULT, ...options };
  if (isString(typeOrOptions)) {
    metadata.generated = typeOrOptions ?? ColumnGenerated.increment;
  } else {
    metadata = { ...{ generated: ColumnGenerated.increment }, ...metadata, ...typeOrOptions };
  }
  metadata.primary = true;
  if (metadata.generated === ColumnGenerated.increment) {
    metadata.type = ColumnType.int;
  } else {
    metadata.type = ColumnType.varchar;
  }
  return applyDecorators(Column(metadata));
}

export enum ColumnType {
  int = 'INT',
  integer = 'INT',
  tinyint = 'TINYINT',
  smallint = 'SMALLINT',
  mediumint = 'MEDIUMINT',
  bigint = 'BIGINT',
  float = 'FLOAT',
  double = 'DOUBLE',
  decimal = 'DECIMAL',
  dec = 'DECIMAL',
  numeric = 'DECIMAL',
  fixed = 'DECIMAL',
  doublePrecision = 'DOUBLE',
  real = 'DOUBLE',
  bool = 'TINYINT',
  boolean = 'TINYINT',
  datetime = 'DATETIME',
  date = 'DATE',
  timestamp = 'TIMESTAMP',
  time = 'TIME',
  year = 'YEAR',
  char = 'CHAR',
  varchar = 'VARCHAR',
  blob = 'BLOB',
  tinyblob = 'TINYBLOB',
  mediumblob = 'MEDIUMBLOB',
  text = 'TEXT',
  tinytext = 'TINYTEXT',
  mediumtext = 'MEDIUMTEXT',
  longtext = 'LONGTEXT',
  binary = 'BINARY',
  varbinary = 'VARBINARY',
  enum = 'ENUM',
  bit = 'BIT',
}

export type ColumnResolver = (columnMetadata: ColumnMetadata) => [string, any[]];

function defaultColumnResolver({
  length,
  type,
  name,
  generated,
  primary,
  nullable,
  precision,
  scale,
  unsigned,
  zerofill,
  defaultRaw,
  enumValue,
  collate,
  comment,
}: ColumnMetadata): [string, any[]] {
  const params: any[] = [name];
  let len =
    !isNullOrUndefined(length) || !isNullOrUndefined(precision) || !isNullOrUndefined(scale)
      ? '(' + (length ? length : `${precision ?? 0},${scale ?? 0}`) + ')'
      : '';
  if (enumValue) {
    let enumValues = isArray(enumValue) ? enumValue : Object.values(enumValue);
    if (enumValues.some(v => isNumber(v))) {
      enumValues = enumValues.filter(isNumber);
    }
    params.push(...enumValues);
    enumValues = enumValues.map(() => `?`);
    len = `(${enumValues.join(',')})`;
  }
  const isNull = nullable ? ' NULL' : ' NOT NULL';
  const increment = generated && generated === ColumnGenerated.increment ? ' AUTO_INCREMENT' : '';
  const primaryKey = primary ? ' PRIMARY KEY' : '';
  let column = `?? ${enumValue ? ColumnType.enum : type}${len}${isNull}${increment}${primaryKey}`;
  if (defaultRaw) {
    column += ` DEFAULT ${defaultRaw}`;
  }
  if (unsigned) {
    column += ` UNSIGNED`;
  }
  if (zerofill) {
    column += ` ZEROFILL`;
  }
  if (collate) {
    column += ` COLLATE ${collate}`;
  }
  if (comment) {
    column += ` COMMENT ?`;
    params.push(comment);
  }
  return [column, params];
}

function intResolver(columnMetadata: ColumnMetadata): [string, any[]] {
  let [query, params] = defaultColumnResolver(columnMetadata);
  if (!columnMetadata.defaultRaw && !isNullOrUndefined(columnMetadata.defaultValue)) {
    query += ' DEFAULT ?';
    params.push(columnMetadata.defaultValue);
  }
  return [query, params];
}

function booleanResolver(columnMetadata: ColumnMetadata): [string, any[]] {
  let [query, params] = defaultColumnResolver(columnMetadata);
  if (!columnMetadata.defaultRaw && !isNullOrUndefined(columnMetadata.defaultValue)) {
    query += ' DEFAULT ?';
    params.push(columnMetadata.defaultValue === true ? 1 : 0);
  }
  return [query, params];
}

function dateResolver(columnMetadata: ColumnMetadata): [string, any[]] {
  let [query, params] = defaultColumnResolver(columnMetadata);
  if (!columnMetadata.defaultRaw && !isNullOrUndefined(columnMetadata.defaultValue)) {
    query += ' DEFAULT ?';
    params.push(
      isDate(columnMetadata.defaultValue) ? columnMetadata.defaultValue.toISOString() : columnMetadata.defaultValue
    );
  }
  return [query, params];
}

function varcharResolver(columnMetadata: ColumnMetadata): [string, any[]] {
  let [query, params] = defaultColumnResolver(columnMetadata);
  if (!columnMetadata.defaultRaw && !isNullOrUndefined(columnMetadata.defaultValue)) {
    query += ' DEFAULT ?';
    params.push(columnMetadata.defaultValue);
  }
  return [query, params];
}

export const resolveColumn: Record<ColumnType, ColumnResolver> = {
  [ColumnType.int]: columnMetadata => intResolver({ ...DefaultTypes[ColumnType.int], ...columnMetadata }),
  [ColumnType.integer]: columnMetadata => intResolver({ ...DefaultTypes[ColumnType.integer], ...columnMetadata }),
  [ColumnType.tinyint]: columnMetadata => intResolver({ ...DefaultTypes[ColumnType.tinyint], ...columnMetadata }),
  [ColumnType.smallint]: columnMetadata => intResolver({ ...DefaultTypes[ColumnType.smallint], ...columnMetadata }),
  [ColumnType.mediumint]: columnMetadata => intResolver({ ...DefaultTypes[ColumnType.mediumint], ...columnMetadata }),
  [ColumnType.bigint]: columnMetadata => intResolver({ ...DefaultTypes[ColumnType.bigint], ...columnMetadata }),
  [ColumnType.float]: columnMetadata => intResolver({ ...DefaultTypes[ColumnType.float], ...columnMetadata }),
  [ColumnType.double]: columnMetadata => intResolver({ ...DefaultTypes[ColumnType.double], ...columnMetadata }),
  [ColumnType.decimal]: columnMetadata => intResolver({ ...DefaultTypes[ColumnType.decimal], ...columnMetadata }),
  [ColumnType.dec]: columnMetadata => intResolver({ ...DefaultTypes[ColumnType.dec], ...columnMetadata }),
  [ColumnType.numeric]: columnMetadata => intResolver({ ...DefaultTypes[ColumnType.numeric], ...columnMetadata }),
  [ColumnType.fixed]: columnMetadata => intResolver({ ...DefaultTypes[ColumnType.fixed], ...columnMetadata }),
  [ColumnType.doublePrecision]: columnMetadata =>
    intResolver({ ...DefaultTypes[ColumnType.doublePrecision], ...columnMetadata }),
  [ColumnType.real]: columnMetadata => intResolver({ ...DefaultTypes[ColumnType.real], ...columnMetadata }),
  [ColumnType.bool]: columnMetadata => booleanResolver({ ...DefaultTypes[ColumnType.bool], ...columnMetadata }),
  [ColumnType.boolean]: columnMetadata => booleanResolver({ ...DefaultTypes[ColumnType.boolean], ...columnMetadata }),
  [ColumnType.datetime]: columnMetadata => dateResolver({ ...DefaultTypes[ColumnType.datetime], ...columnMetadata }),
  [ColumnType.date]: columnMetadata => dateResolver({ ...DefaultTypes[ColumnType.date], ...columnMetadata }),
  [ColumnType.timestamp]: columnMetadata => dateResolver({ ...DefaultTypes[ColumnType.timestamp], ...columnMetadata }),
  [ColumnType.time]: columnMetadata => dateResolver({ ...DefaultTypes[ColumnType.time], ...columnMetadata }),
  [ColumnType.year]: columnMetadata => dateResolver({ ...DefaultTypes[ColumnType.year], ...columnMetadata }),
  [ColumnType.char]: columnMetadata => varcharResolver({ ...DefaultTypes[ColumnType.char], ...columnMetadata }),
  [ColumnType.varchar]: columnMetadata => varcharResolver({ ...DefaultTypes[ColumnType.varchar], ...columnMetadata }),
  [ColumnType.blob]: columnMetadata => defaultColumnResolver({ ...DefaultTypes[ColumnType.blob], ...columnMetadata }),
  [ColumnType.tinyblob]: columnMetadata =>
    defaultColumnResolver({ ...DefaultTypes[ColumnType.tinyblob], ...columnMetadata }),
  [ColumnType.mediumblob]: columnMetadata =>
    defaultColumnResolver({ ...DefaultTypes[ColumnType.mediumblob], ...columnMetadata }),
  [ColumnType.text]: columnMetadata => varcharResolver({ ...DefaultTypes[ColumnType.text], ...columnMetadata }),
  [ColumnType.tinytext]: columnMetadata => varcharResolver({ ...DefaultTypes[ColumnType.tinytext], ...columnMetadata }),
  [ColumnType.mediumtext]: columnMetadata =>
    varcharResolver({ ...DefaultTypes[ColumnType.mediumtext], ...columnMetadata }),
  [ColumnType.longtext]: columnMetadata => varcharResolver({ ...DefaultTypes[ColumnType.longtext], ...columnMetadata }),
  [ColumnType.binary]: columnMetadata =>
    defaultColumnResolver({ ...DefaultTypes[ColumnType.binary], ...columnMetadata }),
  [ColumnType.varbinary]: columnMetadata =>
    defaultColumnResolver({ ...DefaultTypes[ColumnType.varbinary], ...columnMetadata }),
  [ColumnType.enum]: columnMetadata => varcharResolver({ ...DefaultTypes[ColumnType.enum], ...columnMetadata }),
  [ColumnType.bit]: columnMetadata => defaultColumnResolver({ ...DefaultTypes[ColumnType.bit], ...columnMetadata }),
};

export const DefaultTypes: { [key: string]: any } = {
  VARCHAR: { length: 255 },
  CHAR: { length: 1 },
  BINARY: { length: 1 },
  VARBINARY: { length: 255 },
  DECIMAL: { precision: 10, scale: 0 },
  DEC: { precision: 10, scale: 0 },
  NUMERIC: { precision: 10, scale: 0 },
  FIXED: { precision: 10, scale: 0 },
  FLOAT: { precision: 12 },
  DOUBLE: { precision: 22 },
  BIT: { length: 1 },
  INT: { length: 11 },
  TINYINT: { length: 4 },
  SMALLINT: { length: 6 },
  MEDIUMINT: { length: 9 },
  BIGINT: { length: 20 },
};

function resolveMySqlType(type: any): ColumnType | undefined {
  if (!type || !mappedType.has(type)) {
    return ColumnType.varchar;
  }
  return mappedType.get(type);
}

const mappedType = new Map<any, ColumnType>()
  .set(Number, ColumnType.int)
  .set(String, ColumnType.varchar)
  .set(Boolean, ColumnType.boolean)
  .set(Date, ColumnType.datetime);
