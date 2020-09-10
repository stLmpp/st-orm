import './injector/reflect.ts';
import { Container } from './injector/container.ts';

export const ROOT_CONTAINER_KEY = '__root__';
export const rootContainer = Container.create(ROOT_CONTAINER_KEY);
