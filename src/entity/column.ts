import { ReflectMetadata, ReflectMetadataTypes } from '../store/meta.ts';
import { isArray, isDate, isNullOrUndefined, isNumber, isString } from 'is-what';
import { entityStore } from '../store/entity.store.ts';
import { applyDecorators, isArrayEqual } from '../shared/util.ts';
import { IndexMetadata } from './indices.ts';
import { Columns } from '../information-schema/columns.entity.ts';
import { format } from 'datetime';
import { Statement } from '../shared/type.ts';

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
  collation?: string;
}

export interface ColumnMetadata extends ColumnOptions {
  typeTs?: any;
  indices?: IndexMetadata[];
  dbName?: string;
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
  int = 'int',
  integer = 'int',
  tinyint = 'tinyint',
  smallint = 'smallint',
  mediumint = 'mediumint',
  bigint = 'bigint',
  float = 'float',
  double = 'double',
  decimal = 'decimal',
  dec = 'decimal',
  numeric = 'decimal',
  fixed = 'decimal',
  doublePrecision = 'double',
  real = 'double',
  bool = 'tinyint',
  boolean = 'tinyint',
  datetime = 'datetime',
  date = 'date',
  timestamp = 'timestamp',
  time = 'time',
  year = 'year',
  char = 'char',
  varchar = 'varchar',
  blob = 'blob',
  tinyblob = 'tinyblob',
  mediumblob = 'mediumblob',
  text = 'text',
  tinytext = 'tinytext',
  mediumtext = 'mediumtext',
  longtext = 'longtext',
  binary = 'binary',
  varbinary = 'varbinary',
  enum = 'enum',
  bit = 'bit',
}

export type ColumnResolver = (columnMetadata: ColumnMetadata) => Statement;

function defaultColumnResolver(columnMetadata: ColumnMetadata): Statement {
  const { name, generated, nullable, unsigned, zerofill, defaultRaw, collation, comment } = columnMetadata;
  const params: any[] = [name];
  const [typeStatement, typeParams] = getTypeAndLength(columnMetadata);
  params.push(...typeParams);
  const isNull = nullable ? ' NULL' : ' NOT NULL';
  const increment = generated && generated === ColumnGenerated.increment ? ' AUTO_INCREMENT' : '';
  let column = `?? ${typeStatement}${isNull}${increment}`;
  if (defaultRaw) {
    column += ` DEFAULT ${defaultRaw}`;
  }
  if (unsigned) {
    column += ` UNSIGNED`;
  }
  if (zerofill) {
    column += ` ZEROFILL`;
  }
  if (collation) {
    column += ` COLLATE ${collation}`;
  }
  if (comment) {
    column += ` COMMENT ?`;
    params.push(comment);
  }
  return [column, params];
}

function getTypeAndLength({ length, precision, scale, enumValue, type }: ColumnMetadata): Statement {
  const params = [];
  const statement = enumValue ? ColumnType.enum : type;
  let len =
    !isNullOrUndefined(length) || !isNullOrUndefined(precision) || !isNullOrUndefined(scale)
      ? '(' + (length ? length : `${precision ?? 0},${scale ?? 0}`) + ')'
      : '';
  if (enumValue) {
    let enumValues = extractEnumValues(enumValue);
    if (enumValues.some(v => ('' + v).includes(`'`))) {
      throw new Error(`It is not allowed to use "'" in a enum value`);
    }
    params.push(...enumValues);
    enumValues = enumValues.map(() => `?`);
    len = `(${enumValues.join(',')})`;
  }

  return [statement + len, params];
}

function intResolver(columnMetadata: ColumnMetadata): Statement {
  let [query, params] = defaultColumnResolver(columnMetadata);
  if (!columnMetadata.defaultRaw && !isNullOrUndefined(columnMetadata.defaultValue)) {
    query += ' DEFAULT ?';
    params.push(columnMetadata.defaultValue);
  }
  return [query, params];
}

function booleanResolver(columnMetadata: ColumnMetadata): Statement {
  let [query, params] = defaultColumnResolver(columnMetadata);
  if (!columnMetadata.defaultRaw && !isNullOrUndefined(columnMetadata.defaultValue)) {
    query += ' DEFAULT ?';
    params.push(columnMetadata.defaultValue === true ? 1 : 0);
  }
  return [query, params];
}

function dateResolver(columnMetadata: ColumnMetadata): Statement {
  let [query, params] = defaultColumnResolver(columnMetadata);
  if (!columnMetadata.defaultRaw && !isNullOrUndefined(columnMetadata.defaultValue)) {
    query += ' DEFAULT ?';
    params.push(
      isDate(columnMetadata.defaultValue)
        ? format(columnMetadata.defaultValue, 'yyyy-MM-dd hh:mm:ss')
        : columnMetadata.defaultValue
    );
  }
  return [query, params];
}

function varcharResolver(columnMetadata: ColumnMetadata): Statement {
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

function applyDefaultValues(columnMetadata: ColumnMetadata): ColumnMetadata {
  return {
    ...DefaultTypes[columnMetadata.type!],
    ...columnMetadata,
  };
}

export const DefaultTypes: { [key: string]: any } = {
  varchar: { length: 255 },
  char: { length: 1 },
  binary: { length: 1 },
  varbinary: { length: 255 },
  decimal: { precision: 10, scale: 2 },
  dec: { precision: 10, scale: 2 },
  numeric: { precision: 10, scale: 2 },
  fixed: { precision: 10, scale: 2 },
  float: { precision: 12 },
  double: { precision: 22 },
  bit: { length: 1 },
  int: { length: 11 },
  tinyint: { length: 4 },
  smallint: { length: 6 },
  mediumint: { length: 9 },
  bigint: { length: 20 },
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

export function extractEnumValues(enumValue: any): string[] {
  if (!enumValue) {
    return [];
  }
  let enumValues = isArray(enumValue) ? enumValue : Object.values(enumValue);
  if (enumValues.some(v => isNumber(v))) {
    enumValues = enumValues.filter(isNumber);
  }
  return enumValues;
}

export function isNumericType(type: ColumnType): boolean {
  return [
    ColumnType.int,
    ColumnType.integer,
    ColumnType.tinyint,
    ColumnType.smallint,
    ColumnType.mediumint,
    ColumnType.bigint,
    ColumnType.float,
    ColumnType.double,
    ColumnType.decimal,
    ColumnType.dec,
    ColumnType.numeric,
    ColumnType.fixed,
    ColumnType.doublePrecision,
    ColumnType.real,
    ColumnType.bool,
    ColumnType.boolean,
    ColumnType.bit,
  ].includes(type);
}

export function isStringType(type: ColumnType): boolean {
  return [
    ColumnType.char,
    ColumnType.varchar,
    ColumnType.blob,
    ColumnType.tinyblob,
    ColumnType.mediumblob,
    ColumnType.text,
    ColumnType.tinytext,
    ColumnType.mediumtext,
    ColumnType.longtext,
    ColumnType.enum,
  ].includes(type);
}

export function isDateType(type: ColumnType): boolean {
  return [ColumnType.datetime, ColumnType.date, ColumnType.timestamp, ColumnType.time, ColumnType.year].includes(type);
}

export function columnHasChanged(oldColumn: Columns, newColumn: ColumnMetadata): boolean {
  const typeDb = oldColumn.getType();
  const isEnum = typeDb.type === ColumnType.enum;
  if (isEnum) {
    newColumn = { ...newColumn, type: ColumnType.enum };
  }
  newColumn = applyDefaultValues(newColumn);
  const columnTypeLower = oldColumn.COLUMN_TYPE.toLowerCase();
  const defaultValue = oldColumn.getDefaultValue();
  const newDefaultValue = newColumn.defaultRaw
    ? newColumn.defaultRaw === 'CURRENT_TIMESTAMP'
      ? 'now()'
      : newColumn.defaultRaw.toLowerCase()
    : isDate(newColumn.defaultValue)
    ? format(newColumn.defaultValue, 'yyyy-MM-dd hh:mm:ss')
    : isString(newColumn.defaultValue)
    ? newColumn.defaultValue.toLowerCase()
    : newColumn.defaultValue;
  /*logColumnChanges(oldColumn.COLUMN_NAME, {
    oldColumn,
    newDefaultValue,
    defaultValue,
    columnTypeLower,
    newColumn,
    typeDb,
    isEnum,
  });*/
  return (
    (oldColumn.IS_NULLABLE === 'YES') !== !!newColumn.nullable ||
    (oldColumn.COLUMN_COMMENT || undefined) !== newColumn.comment ||
    (isEnum && !isArrayEqual(typeDb.enumValues, extractEnumValues(newColumn.enumValue))) ||
    typeDb.type !== newColumn.type ||
    typeDb.length !== newColumn.length ||
    typeDb.precision !== newColumn.precision ||
    typeDb.scale !== newColumn.scale ||
    oldColumn.COLLATION_NAME != newColumn.collation ||
    (columnTypeLower.includes('unsigned') && !newColumn.unsigned) ||
    (columnTypeLower.includes('zerofill') && !newColumn.zerofill) ||
    (!isNullOrUndefined(defaultValue) && defaultValue !== newDefaultValue)
  );
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function logColumnChanges(
  name: string,
  {
    newColumn,
    oldColumn,
    typeDb,
    defaultValue,
    isEnum,
    columnTypeLower,
    newDefaultValue,
  }: {
    typeDb: {
      type: ColumnType;
      length?: number;
      precision?: number;
      scale?: number;
      enumValues?: string[];
    };
    isEnum: boolean;
    columnTypeLower: string;
    defaultValue: any;
    newDefaultValue: any;
    oldColumn: Columns;
    newColumn: ColumnMetadata;
  }
): void {
  /* eslint-disable no-console */
  // TODO LOGGER
  console.log(`COLUMN: ${name}`);
  console.table([
    {
      prop: 'nullable',
      changed: (oldColumn.IS_NULLABLE === 'YES') !== !!newColumn.nullable,
      dbValue: oldColumn.IS_NULLABLE,
      newValue: newColumn.nullable,
    },
    {
      prop: 'comment',
      changed: (oldColumn.COLUMN_COMMENT || undefined) !== newColumn.comment,
      dbValue: oldColumn.COLUMN_COMMENT,
      newValue: newColumn.comment,
    },
    {
      prop: 'enum',
      changed: isEnum && !isArrayEqual(typeDb.enumValues, extractEnumValues(newColumn.enumValue)),
      dbValue: typeDb.enumValues,
      newValue: extractEnumValues(newColumn.enumValue),
    },
    {
      prop: 'type',
      changed: typeDb.type !== newColumn.type,
      dbValue: typeDb.type,
      newValue: newColumn.type,
    },
    {
      prop: 'length',
      changed: typeDb.length !== newColumn.length,
      dbValue: typeDb.length,
      newValue: newColumn.length,
    },
    {
      prop: 'precision',
      changed: typeDb.precision !== newColumn.precision,
      dbValue: typeDb.precision,
      newValue: newColumn.precision,
    },
    {
      prop: 'scale',
      changed: typeDb.scale !== newColumn.scale,
      dbValue: typeDb.scale,
      newValue: newColumn.scale,
    },
    {
      prop: 'collate',
      changed: oldColumn.COLLATION_NAME != newColumn.collation,
      dbValue: oldColumn.COLLATION_NAME,
      newValue: newColumn.collation,
    },
    {
      prop: 'unsigned',
      changed: columnTypeLower.includes('unsigned') !== !!newColumn.unsigned,
      dbValue: columnTypeLower.includes('unsigned'),
      newValue: newColumn.unsigned,
    },
    {
      prop: 'zerofill',
      changed: columnTypeLower.includes('zerofill') !== !!newColumn.zerofill,
      dbValue: columnTypeLower.includes('zerofill'),
      newValue: newColumn.zerofill,
    },
    {
      prop: 'default',
      changed: defaultValue !== newDefaultValue,
      dbValue: defaultValue,
      newValue: newDefaultValue,
    },
  ]);
  console.log('----------------------------------------');
  /* eslint-enable no-console */
}
