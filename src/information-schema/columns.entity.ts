import { Column, ColumnType, isDateType, isNumericType } from '../entity/column.ts';
import { Entity } from '../entity/entity.ts';
import { Tables } from './tables.entity.ts';
import { ManyToOne } from '../entity/many-to-one.ts';
import { JoinColumn } from '../entity/join-column.ts';
import { OneToMany } from '../entity/one-to-many.ts';
import { Statistics } from './statistics.entity.ts';

@Entity({ connection: 'information_schema', sync: false })
export class Columns {
  @Column() TABLE_CATALOG!: string;
  @Column() TABLE_SCHEMA!: string;
  @Column({ primary: true }) TABLE_NAME!: string;
  @Column({ primary: true }) COLUMN_NAME!: string;
  @Column() ORDINAL_POSITION!: number;
  @Column() COLUMN_DEFAULT!: string;
  @Column() IS_NULLABLE!: string;
  @Column() DATA_TYPE!: ColumnType;
  @Column() CHARACTER_MAXIMUM_LENGTH?: number;
  @Column() CHARACTER_OCTET_LENGTH?: number;
  @Column() NUMERIC_PRECISION?: number;
  @Column() NUMERIC_SCALE?: number;
  @Column() DATETIME_PRECISION?: number;
  @Column() CHARACTER_SET_NAME!: string;
  @Column() COLLATION_NAME!: string;
  @Column() COLUMN_TYPE!: string;
  @Column() COLUMN_KEY!: string;
  @Column() EXTRA!: string;
  @Column() PRIVILEGES!: string;
  @Column() COLUMN_COMMENT!: string;
  @Column() GENERATION_EXPRESSION!: string;

  @ManyToOne(() => Tables, 'columns')
  @JoinColumn([
    { name: 'TABLE_NAME', referencedColumn: 'TABLE_NAME' },
    { name: 'TABLE_SCHEMA', referencedColumn: 'TABLE_SCHEMA' },
  ])
  table!: Tables;

  @OneToMany(() => Statistics, 'column')
  indexes!: Statistics;

  getType(): {
    type: ColumnType;
    length?: number;
    precision?: number;
    scale?: number;
    enumValues?: string[];
  } {
    const type = this.DATA_TYPE as ColumnType;
    if (!this.COLUMN_TYPE.includes('(')) {
      return { type };
    }
    let values: any[];
    switch (type) {
      case ColumnType.enum: {
        values = (this.COLUMN_TYPE.match(/'([^' ]*)'/g) ?? []).map(v => v.substring(1, v.length - 1));
        return {
          type,
          enumValues: values,
        };
      }
      default: {
        values = (this.COLUMN_TYPE.match(/\(([^)]+)\)/)?.[1] ?? '')
          .split(',')
          .map(v => v.trim())
          .filter(Boolean)
          .map(v => Number(v));
        const ret: any = { type };
        if (values.length < 2) {
          ret.length = values[0];
        } else {
          ret.precision = values[0];
          ret.scale = values[1];
        }
        return ret;
      }
    }
  }

  getDefaultValue(): string | number | undefined {
    if (!this.COLUMN_DEFAULT) {
      return undefined;
    }
    if (isNumericType(this.DATA_TYPE)) {
      return Number(this.COLUMN_DEFAULT);
    } else if (isDateType(this.DATA_TYPE)) {
      if (this.COLUMN_DEFAULT === 'CURRENT_TIMESTAMP') {
        return 'now()';
      } else {
        return this.COLUMN_DEFAULT;
      }
    }
    return undefined;
  }
}
