import { Driver } from '../driver/driver.ts';
import { Client, ClientConfig } from 'mysql';
import { defaultNamingStrategy, NamingStrategy } from '../shared/naming-strategy.ts';
import { entityStore } from '../store/entity-store.ts';
import { Type } from '../shared/type.ts';
import { Repository } from '../repository/repository.ts';
import { EntityMetadata } from '../entity/entity.ts';
import { informationSchemaNamingStrategy } from '../information-schema/information-schema.naming-strategy.ts';
import { StMap } from '../shared/map.ts';

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

export interface ConnectionConfigInternal extends ConnectionConfig {
  version: string;
  isGreaterThan5: boolean;
}

export class Connection {
  static async createConnection(config: ConnectionConfig): Promise<Connection> {
    const client = await new Client().connect(config);
    config.name = config.name ?? 'default';
    config.namingStrategy = config.namingStrategy ?? defaultNamingStrategy;
    const version = (await client.query('select version() as version'))[0].version;
    const isGreaterThan5 = +version.split('.').shift() > 5;
    const newConfig: ConnectionConfigInternal = { ...config, version, isGreaterThan5 };
    if (!newConfig.charset) {
      newConfig.charset = isGreaterThan5 ? 'utf8mb4' : 'utf8';
    }
    if (!newConfig.collation) {
      newConfig.collation = isGreaterThan5 ? 'utf8mb4_0900_ai_ci' : 'utf8_unicode_ci';
    }
    entityStore.updateDefaults(newConfig, newConfig.namingStrategy!);
    const entitiesMap = entityStore.getEntitiesConnection(newConfig.name);
    let informationSchemaConnection: Connection;
    if (config.db !== 'information_schema') {
      informationSchemaConnection = await Connection.createConnection({
        ...config,
        namingStrategy: informationSchemaNamingStrategy,
        sync: false,
        name: 'information_schema',
        db: 'information_schema',
      });
    }
    const driver = new Driver(client, newConfig, entitiesMap, informationSchemaConnection!);
    if (newConfig.sync) {
      await driver.sync();
    }
    return new Connection(config.name, driver, newConfig, entitiesMap);
  }

  static async createConnections(configs: ConnectionConfig[]): Promise<Record<string, Connection>> {
    const connections: Record<string, Connection> = {};
    for (const config of configs) {
      connections[config.name!] = await Connection.createConnection(config);
    }
    return connections;
  }

  constructor(
    private name: string,
    public driver: Driver,
    private options: ConnectionConfigInternal,
    private entitiesMap: StMap<any, EntityMetadata>
  ) {}

  #repositories = new StMap<Type, Repository<any>>();

  async sync(): Promise<void> {
    await this.driver.sync();
  }

  async disconnect(): Promise<void> {
    await this.driver.disconnect();
  }

  getRepository<T>(entity: Type<T>): Repository<T> {
    if (this.#repositories.has(entity)) {
      return this.#repositories.get(entity)!;
    }
    if (!this.entitiesMap.has(entity)) {
      throw new Error(
        `Entity ${
          entity?.name ?? entity
        } doesn't exist in this connection\nDid you forget to decorate it with @Entity()?`
      );
    }
    const repository = new Repository<T>(entity, this.entitiesMap.get(entity)!, this.driver);
    this.#repositories.set(entity, repository);
    return repository;
  }
}
