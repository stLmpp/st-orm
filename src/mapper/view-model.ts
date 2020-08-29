import { applyDecorators } from '../shared/util.ts';
import { Entity } from '../entity/entity.ts';
import { Column } from '../entity/column.ts';

export function ViewModel(): ClassDecorator {
  return applyDecorators(Entity({ sync: false }));
}

export function Property(): PropertyDecorator {
  return applyDecorators(Column());
}
