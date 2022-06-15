import { Entity, EntityPropertyValue } from '~/src/j1/types';
import fetch, { RequestInit, Response as FetchResponse } from 'node-fetch';
import { print as graphqlAstToString } from 'graphql/language/printer';
import { DocumentNode } from 'graphql';
import * as j1GraphQL from './j1GraphQL';
import { EntityForSync, RelationshipForSync } from '~/src/types';
import { retry } from '@lifeomic/attempt';

export type JupiterOneEnvironment = 'localhost' | 'dev' | 'prod' | 'fedramp' | undefined;

export type J1Options = {
  accountId: string;
  targetEnvironment: JupiterOneEnvironment;
  apiKey: string;
};

export type GraphQLApiResponseError = {
  code?: string;
  message: string;
};

export type GraphQLApiResponseBodyWithErrors = {
  errors?: GraphQLApiResponseError[];
};

export type GraphQLApiResponseBodyWithResult<T> = {
  data: {
    result: T;
  };
};

class GraphQLResponseError extends Error {
  constructor(errors: GraphQLApiResponseError[]) {
    super(
      `Received JupiterOne API error response. Errors: ` +
        errors
          .map((error) => {
            return `${error.message} (code=${error.code || '<none>'})`;
          })
          .join(', ')
    );
  }
}

export type JupiterOneQuery<I, O> = {
  nameForLogging: string;
  ast: DocumentNode;
};

function buildRequestHeaders(
  j1Client: JupiterOneClient,
  headers?: Record<string, string>
) {
  return {
    Authorization: `Bearer ${j1Client.apiKey}`,
    'LifeOmic-Account': j1Client.accountId,
    ...headers,
  };
}
async function makeGraphQLRequest<I, O>(options: {
  apiUrl: string;
  j1Client: JupiterOneClient;
  query: JupiterOneQuery<I, O>;
  input: I;
  resultKey?: string;
}) {
  const { apiUrl } = options;
  const headers = buildRequestHeaders(options.j1Client, {
    'Content-Type': 'application/json',
  });

  const body = {
    query: graphqlAstToString(options.query.ast),
    variables: options.input,
  };

  const response = await makeFetchRequest(
    apiUrl,
    {
      method: 'POST',
      body: JSON.stringify(body),
      headers,
    },
    options.query.nameForLogging
  );

  const bodyObj = await response.json();
  const errors = (bodyObj as GraphQLApiResponseBodyWithErrors).errors;
  if (errors) {
    throw new GraphQLResponseError(errors);
  }

  return bodyObj.data[options.resultKey || 'result'] as O;
}

export type DeferredJ1QLQueryState = {
  status: 'IN_PROGRESS' | 'COMPLETED' | 'FAILED';
  error: string | null;
  url: string | null;
};

async function sleep(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, 500);
  });
}

async function makeDeferredJ1QLRequest<T>(options: {
  j1Client: JupiterOneClient;
  j1ql: string;
  j1qlVariables: j1GraphQL.J1QLVariables;
}) {
  const deferredData = await makeGraphQLRequest({
    apiUrl: options.j1Client.queryGraphQLApiUrl,
    j1Client: options.j1Client,
    query: j1GraphQL.QUERY_DEFERRED_J1QL,
    input: {
      query: options.j1ql,
    },
  });

  // Poll for completion
  let j1qlState: DeferredJ1QLQueryState | undefined;
  let attemptNum = 0;

  do {
    if (attemptNum) {
      await sleep(500);
    }

    attemptNum++;

    const statusResponse = await makeFetchRequest(
      deferredData.url,
      {
        method: 'GET',
      },
      'Deferred J1QL Query Status'
    );

    j1qlState = await statusResponse.json();
    if (j1qlState!.status === 'FAILED') {
      throw new Error(
        `J1QL query failed. Error: ${j1qlState!.error || '(unknown'}`
      );
    }
  } while (j1qlState!.status === 'IN_PROGRESS' && attemptNum < 100);

  const queryResponse = await fetch(j1qlState!.url!, {
    method: 'GET',
  });

  const finalData = (await queryResponse.json()) as T;
  return finalData;
}

type EntityListItem = {
  id: string;
  entity: object;
  properties: object;
};

async function validateSyncJobResponse(response: FetchResponse) {
  const rawBody = await response.json();
  const body = rawBody as Partial<SyncJobResonse>;
  if (!body.job) {
    throw new Error(
      `JupiterOne API error. Sync job response did not return job. Response: ${JSON.stringify(
        rawBody,
        null,
        2
      )}`
    );
  }
  return body as SyncJobResonse;
}

export enum SyncJobStatus {
  AWAITING_UPLOADS = 'AWAITING_UPLOADS',
  FINALIZE_PENDING = 'FINALIZE_PENDING',
  FINALIZING_ENTITIES = 'FINALIZING_ENTITIES',
  FINALIZING_RELATIONSHIPS = 'FINALIZING_RELATIONSHIPS',
  ABORTED = 'ABORTED',
  FINISHED = 'FINISHED',
  UNKNOWN = 'UNKNOWN',
  ERROR_BAD_DATA = 'ERROR_BAD_DATA',
  ERROR_UNEXPECTED_FAILURE = 'ERROR_UNEXPECTED_FAILURE',
}

export type SyncJob = {
  source: string;
  scope: string;
  accountId: string;
  id: string;
  status: SyncJobStatus;
  done: boolean;
  startTimestamp: number;
  numEntitiesUploaded: number;
  numEntitiesCreated: number;
  numEntitiesUpdated: number;
  numEntitiesDeleted: number;
  numEntityCreateErrors: number;
  numEntityUpdateErrors: number;
  numEntityDeleteErrors: number;
  numEntityRawDataEntriesUploaded: number;
  numEntityRawDataEntriesCreated: number;
  numEntityRawDataEntriesUpdated: number;
  numEntityRawDataEntriesDeleted: number;
  numEntityRawDataEntryCreateErrors: number;
  numEntityRawDataEntryUpdateErrors: number;
  numEntityRawDataEntryDeleteErrors: number;
  numRelationshipsUploaded: number;
  numRelationshipsCreated: number;
  numRelationshipsUpdated: number;
  numRelationshipsDeleted: number;
  numRelationshipCreateErrors: number;
  numRelationshipUpdateErrors: number;
  numRelationshipDeleteErrors: number;
  numRelationshipRawDataEntriesUploaded: number;
  numRelationshipRawDataEntriesCreated: number;
  numRelationshipRawDataEntriesUpdated: number;
  numRelationshipRawDataEntriesDeleted: number;
  numRelationshipRawDataEntryCreateErrors: number;
  numRelationshipRawDataEntryUpdateErrors: number;
  numRelationshipRawDataEntryDeleteErrors: number;
  numMappedRelationshipsCreated: number;
  numMappedRelationshipsUpdated: number;
  numMappedRelationshipsDeleted: number;
  numMappedRelationshipCreateErrors: number;
  numMappedRelationshipUpdateErrors: number;
  numMappedRelationshipDeleteErrors: number;
  syncMode: 'DIFF' | 'CREATE_OR_UPDATE';
};

export type SyncJobResonse = {
  job: SyncJob;
};

class FetchError extends Error {
  httpStatusCode: number;

  constructor(options: {
    responseBody: string;
    response: FetchResponse;
    method: string;
    url: string;
    nameForLogging?: string;
  }) {
    super(
      `JupiterOne API error. Response not OK (requestName=${
        options.nameForLogging || '(none)'
      }, status=${options.response.status}, url=${options.url}, method=${
        options.method
      }). Response: ${options.responseBody}`
    );
    this.httpStatusCode = options.response.status;
  }
}

async function makeFetchRequest(
  url: string,
  options: RequestInit,
  nameForLogging?: string
) {
  return retry(
    async () => {
      const response = await fetch(url, options);
      const { status } = response;
      if (status < 200 || status >= 300) {
        const responseBody = await response.text();
        throw new FetchError({
          method: options.method!,
          response,
          responseBody,
          url,
          nameForLogging,
        });
      }
      return response;
    },
    {
      maxAttempts: 5,
      delay: 1000,
      handleError(err, context, options) {
        const possibleFetchError = err as Partial<FetchError>;
        const { httpStatusCode } = possibleFetchError;
        if (httpStatusCode !== undefined) {
          if (httpStatusCode < 500) {
            context.abort();
          }
        }
      },
    }
  );
}

class JupiterOneClient {
  apiKey: string;
  persisterRestApiUrl: string;
  persisterGraphQLApiUrl: string;
  queryGraphQLApiUrl: string;
  accountId: string;

  constructor(options: J1Options) {
    this.apiKey = options.apiKey.trim();
    this.accountId = options.accountId.trim();

    let persisterRestApiUrl: string;
    let persisterGraphQLApiUrl: string;
    let queryGraphQLApiUrl: string;

    const targetEnvironment = options.targetEnvironment || 'prod';

    if (targetEnvironment === 'localhost') {
      persisterRestApiUrl = 'http://localhost:8080';
      persisterGraphQLApiUrl = 'http://localhost:8080/persister/graphql';
      queryGraphQLApiUrl = 'https://api.dev.jupiterone.io/graphql';
    } else if (targetEnvironment === 'prod') {
      persisterRestApiUrl = 'https://api.us.jupiterone.io';
      persisterGraphQLApiUrl = 'https://api.us.jupiterone.io/graphql';
      queryGraphQLApiUrl = 'https://api.us.jupiterone.io/graphql';
    } else if (targetEnvironment === 'dev') {
      persisterRestApiUrl = 'https://api.dev.jupiterone.io';
      persisterGraphQLApiUrl = 'https://api.dev.jupiterone.io/graphql';
      queryGraphQLApiUrl = 'https://api.dev.jupiterone.io/graphql';
    } else if (targetEnvironment === 'fedramp') {
      persisterRestApiUrl = 'https://api.fedramp.jupiterone.io';
      persisterGraphQLApiUrl = 'https://api.fedramp.jupiterone.io/graphql';
      queryGraphQLApiUrl = 'https://api.fedramp.jupiterone.io/graphql';
    } else {
      throw new Error(
        'Unrecognized target JupiterOne environment: ' + targetEnvironment
      );
    }

    this.persisterRestApiUrl = persisterRestApiUrl;
    this.persisterGraphQLApiUrl = persisterGraphQLApiUrl;
    this.queryGraphQLApiUrl = queryGraphQLApiUrl;
  }

  async queryForEntityList(j1ql: string): Promise<Entity[]> {
    const queryResponse: {
      type: 'list';
      totalCount: number;
      data: EntityListItem[];
    } = await makeDeferredJ1QLRequest({
      j1Client: this,
      j1ql,
      j1qlVariables: {},
    });

    const entities = queryResponse.data.map((item) => {
      return {
        ...item.properties,
        ...item.entity,
      } as Entity;
    });

    return entities;
  }

  async queryForEntityTableList(
    j1ql: string
  ): Promise<Record<string, EntityPropertyValue>[]> {
    const queryResponse: {
      type: 'table';
      totalCount: number;
      data: Record<string, EntityPropertyValue>[];
    } = await makeDeferredJ1QLRequest({
      j1Client: this,
      j1ql,
      j1qlVariables: {},
    });

    return queryResponse.data;
  }

  async uploadEntityRawData(options: {
    entityId: string;
    entryName: string;
    contentType: 'text/html' | 'application/json';
    body: object | string;
  }) {
    const headers = buildRequestHeaders(this, {
      'Content-Type': options.contentType,
    });
    await makeFetchRequest(
      this.persisterRestApiUrl +
        `/entities/${options.entityId}/raw-data/${options.entryName}`,
      {
        method: 'PUT',
        headers,
        body:
          typeof options.body === 'string'
            ? options.body
            : JSON.stringify(options.body),
      }
    );
  }

  async startSyncJob(options: { source: 'api'; scope: string }) {
    const headers = buildRequestHeaders(this, {
      'Content-Type': 'application/json',
    });
    const response = await makeFetchRequest(
      this.persisterRestApiUrl + `/persister/synchronization/jobs`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify(options),
      }
    );
    return validateSyncJobResponse(response);
  }

  async uploadGraphObjectsForSyncJob(options: {
    syncJobId: string;
    entities?: EntityForSync[];
    relationships?: RelationshipForSync[];
  }) {
    const { syncJobId, entities, relationships } = options;
    const headers = buildRequestHeaders(this, {
      'Content-Type': 'application/json',
    });
    const response = await makeFetchRequest(
      this.persisterRestApiUrl +
        `/persister/synchronization/jobs/${syncJobId}/upload`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({
          entities,
          relationships,
        }),
      }
    );
    return validateSyncJobResponse(response);
  }

  async finalizeSyncJob(options: { syncJobId: string }) {
    const { syncJobId } = options;
    const headers = buildRequestHeaders(this, {
      'Content-Type': 'application/json',
    });
    const response = await makeFetchRequest(
      this.persisterRestApiUrl +
        `/persister/synchronization/jobs/${syncJobId}/finalize`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({}),
      }
    );
    return validateSyncJobResponse(response);
  }

  async fetchSyncJobStatus(options: { syncJobId: string }) {
    const { syncJobId } = options;
    const headers = buildRequestHeaders(this);
    const response = await makeFetchRequest(
      this.persisterRestApiUrl + `/persister/synchronization/jobs/${syncJobId}`,
      {
        method: 'GET',
        headers,
      }
    );
    return validateSyncJobResponse(response);
  }

  async updateEntity(input: j1GraphQL.UpdateEntityInput) {
    return makeGraphQLRequest({
      apiUrl: this.persisterGraphQLApiUrl,
      j1Client: this,
      input,
      query: j1GraphQL.MUTATION_UPDATE_ENTITY,
    });
  }

  async updateRelationship(input: j1GraphQL.UpdateRelationshipInput) {
    return makeGraphQLRequest({
      apiUrl: this.persisterGraphQLApiUrl,
      j1Client: this,
      input,
      query: j1GraphQL.MUTATION_UPDATE_RELATIONSHIP,
    });
  }

  async updateConfig(input: j1GraphQL.UpdateConfigInput) {
    return makeGraphQLRequest<
      j1GraphQL.UpdateConfigInput,
      j1GraphQL.UpdateConfigOutput
    >({
      apiUrl: this.queryGraphQLApiUrl,
      j1Client: this,
      input,
      query: j1GraphQL.MUTATION_UPDATE_CONFIG,
    });
  }

  async upsertPolicy(input: j1GraphQL.UpsertPolicyInput) {
    return makeGraphQLRequest<
      j1GraphQL.UpsertPolicyInput,
      j1GraphQL.UpsertPolicyOutput
    >({
      apiUrl: this.queryGraphQLApiUrl,
      j1Client: this,
      input,
      query: j1GraphQL.MUTATION_UPSERT_POLICY,
      resultKey: 'upsertPolicyById',
    });
  }

  async upsertProcedure(input: j1GraphQL.UpsertProcedureInput) {
    return makeGraphQLRequest<
      j1GraphQL.UpsertProcedureInput,
      j1GraphQL.UpsertProcedureOutput
    >({
      apiUrl: this.queryGraphQLApiUrl,
      j1Client: this,
      input,
      query: j1GraphQL.MUTATION_UPSERT_PROCEDURE,
      resultKey: 'upsertProcedureById',
    });
  }

  async reorderItems(input: j1GraphQL.ReorderAllItemsByMappingInput) {
    return makeGraphQLRequest<
      j1GraphQL.ReorderAllItemsByMappingInput,
      j1GraphQL.ReorderAllItemsByMappingOutput
    >({
      apiUrl: this.queryGraphQLApiUrl,
      j1Client: this,
      input,
      query: j1GraphQL.MUTATION_REORDER_ITEMS,
      resultKey: 'reorderAllItemsByMapping',
    });
  }
}

export function createJupiterOneClient(options: J1Options) {
  return new JupiterOneClient(options);
}

export type { JupiterOneClient };
