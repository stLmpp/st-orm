import { Driver } from '../driver/driver.ts';
import { Client, ClientConfig } from 'mysql';
import { defaultNamingStrategy, NamingStrategy } from '../shared/naming-strategy.ts';
import { entityStore } from '../store/entity.store.ts';
import { RequiredBy, Type } from '../shared/type.ts';
import { Repository } from '../repository/repository.ts';
import { EntityMetadata } from '../entity/entity.ts';
import { informationSchemaNamingStrategy } from '../information-schema/information-schema.naming-strategy.ts';
import { StMap } from '../shared/map.ts';
import { MapProfile } from '../mapper/mapper.store.ts';

export interface SyncOptions {
  dropUnknownTables?: boolean;
  dropUnknownColumns?: boolean;
  dropUnknownIndices?: boolean;
  dropUnknownRelations?: boolean;
  askBeforeSync?: boolean;
  dropSchema?: boolean;
}

export interface ConnectionConfig extends ClientConfig {
  name?: string;
  namingStrategy?: NamingStrategy;
  sync?: boolean;
  syncOptions?: SyncOptions;
  charset?: string;
  collation?: string;
}

export interface ConnectionConfigInternal extends RequiredBy<ConnectionConfig, 'name' | 'namingStrategy'> {
  version: string;
  isGreaterThan5: boolean;
}

export class Connection {
  static async createConnection(config: ConnectionConfig): Promise<Connection> {
    const client = await new Client().connect(config);
    const version = (await client.query('select version() as version'))[0].version;
    const isGreaterThan5 = +version.split('.').shift() > 5;
    const newConfig: ConnectionConfigInternal = {
      ...config,
      version,
      isGreaterThan5,
      name: config.name ?? 'default',
      namingStrategy: config.namingStrategy ?? defaultNamingStrategy,
    };
    if (!newConfig.charset) {
      newConfig.charset = isGreaterThan5 ? 'utf8mb4' : 'utf8';
    }
    if (!newConfig.collation) {
      newConfig.collation = isGreaterThan5 ? 'utf8mb4_0900_ai_ci' : 'utf8_unicode_ci';
    }
    entityStore.updateDefaults(newConfig, newConfig.namingStrategy);
    const entitiesMap = entityStore.getEntitiesConnection(newConfig.name);
    let informationSchemaConnection: Connection | undefined;
    if (config.db !== 'information_schema') {
      informationSchemaConnection = await Connection.createConnection({
        ...config,
        namingStrategy: informationSchemaNamingStrategy,
        sync: false,
        name: 'information_schema',
        db: 'information_schema',
      });
    }
    const driver = new Driver(client, newConfig, entitiesMap, informationSchemaConnection);
    if (newConfig.sync) {
      await driver.sync();
    }
    return new Connection(newConfig.name, driver, newConfig, entitiesMap);
  }

  static async createConnections(
    configs: Array<Omit<ConnectionConfig, 'name'> & Required<Pick<ConnectionConfig, 'name'>>>
  ): Promise<Record<string, Connection>> {
    const connections: Record<string, Connection> = {};
    for (const config of configs) {
      connections[config.name] = await Connection.createConnection(config);
    }
    return connections;
  }

  constructor(
    private name: string,
    public driver: Driver,
    private options: ConnectionConfigInternal,
    public entitiesMap: StMap<any, EntityMetadata>
  ) {}

  #repositories = new Map<Type, Repository<any>>();

  async sync(): Promise<void> {
    await this.driver.sync();
  }

  async disconnect(): Promise<void> {
    await this.driver.disconnect();
  }

  getRepository<T>(entity: Type<T>): Repository<T> {
    const repositoryCache = this.#repositories.get(entity);
    if (repositoryCache) {
      return repositoryCache;
    }
    const entityMetadata = this.entitiesMap.get(entity);
    if (!entityMetadata) {
      throw new Error(
        `Entity ${
          entity?.name ?? entity
        } doesn't exist in this connection\nDid you forget to decorate it with @Entity()?`
      );
    }
    const repository = new Repository<T>(entity, entityMetadata, this.driver);
    this.#repositories.set(entity, repository);
    return repository;
  }

  createMap<From, To>(from: Type<From>, to: Type<To>): MapProfile<From, To> {
    const fromMetadata = this.entitiesMap.get(from);
    const toMetadata = this.entitiesMap.get(to);
    if (!fromMetadata) {
      throw new Error(`Could not find metadata from "${from?.name || from}"`);
    }
    if (!toMetadata) {
      throw new Error(`Could not find metadata from "${from?.name || from}"`);
    }
    return new MapProfile<From, To>(from, to, fromMetadata, toMetadata);
  }
}
