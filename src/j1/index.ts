import { Entity, GraphObject } from '~/src/j1/types';
import fetch, { Response as FetchResponse } from 'node-fetch';
import { print as graphqlAstToString } from 'graphql/language/printer';
import { DocumentNode } from 'graphql';
import * as j1GraphQL from './j1GraphQL';

export type J1Options = {
  accountId: string;
  dev: boolean;
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

class FetchResponseError extends Error {
  constructor(options: {
    requestName: string;
    response: FetchResponse;
    responseBody: string;
  }) {
    super(
      `JupiterOne API request failed (request=${options.requestName}, status=${options.response.status}). RESPONSE=${options.responseBody}`
    );
  }
}

export type JupiterOneQuery<I, O> = {
  nameForLogging: string;
  ast: DocumentNode;
};

function isResponseOk(response: FetchResponse) {
  return response.status >= 200 && response.status < 300;
}

async function createFetchResponseError(options: {
  response: FetchResponse;
  requestName: string;
}) {
  let responseBody: string;
  try {
    responseBody = await options.response.text();
  } catch (err) {
    responseBody = `(error reading body of response, error=${err.toString()})`;
  }
  return new FetchResponseError({
    requestName: options.requestName,
    response: options.response,
    responseBody,
  });
}

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
  j1Client: JupiterOneClient;
  query: JupiterOneQuery<I, O>;
  input: I;
}) {
  const { j1Client } = options;
  const headers = buildRequestHeaders(options.j1Client, {
    'Content-Type': 'application/json',
  });

  const body = {
    query: graphqlAstToString(options.query.ast),
    variables: options.input,
  };

  const response = await fetch(j1Client.apiUrl + '/graphql', {
    method: 'POST',
    body: JSON.stringify(body),
    headers,
  });

  if (!isResponseOk(response)) {
    throw await createFetchResponseError({
      response,
      requestName: options.query.nameForLogging,
    });
  }

  const bodyObj = await response.json();
  const errors = (bodyObj as GraphQLApiResponseBodyWithErrors).errors;
  if (errors) {
    throw new GraphQLResponseError(errors);
  }

  return (bodyObj as GraphQLApiResponseBodyWithResult<O>).data.result;
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

    const statusResponse = await fetch(deferredData.url, {
      method: 'GET',
    });

    if (!isResponseOk(statusResponse)) {
      throw await createFetchResponseError({
        response: statusResponse,
        requestName: 'Deferred J1QL Query Status',
      });
    }

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

type RelationshipListItem = {
  id: string;
  relationship: object;
  properties: object;
};

class JupiterOneClient {
  apiKey: string;
  apiUrl: string;
  accountId: string;

  constructor(options: J1Options) {
    this.apiKey = options.apiKey.trim();
    this.apiUrl = options.dev
      ? 'https://api.dev.jupiterone.io'
      : 'https://api.us.jupiterone.io';
    this.accountId = options.accountId;
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

  async queryForGraphObjectTable(
    j1ql: string
  ): Promise<Record<string, GraphObject>[]> {
    const queryResponse: {
      type: 'table';
      totalCount: number;
      data: Record<string, EntityListItem | RelationshipListItem>[];
    } = await makeDeferredJ1QLRequest({
      j1Client: this,
      j1ql,
      j1qlVariables: {},
    });

    return queryResponse.data.map((item) => {
      const finalItem: Record<string, GraphObject> = {};
      for (const key of Object.keys(item)) {
        const graphObjectForKey = item[key];
        const possibleEntity = (graphObjectForKey as EntityListItem).entity;
        const possibleRelationship = (graphObjectForKey as RelationshipListItem)
          .relationship;
        finalItem[key] = {
          ...graphObjectForKey.properties,
          ...possibleEntity,
          ...possibleRelationship,
        } as GraphObject;
      }
      return finalItem;
    });
  }

  async upsertEntityRawData(options: {
    entityId: string;
    entryName: string;
    contentType: 'text/html' | 'application/json';
    body: object | string;
  }) {
    const headers = buildRequestHeaders(this, {
      'Content-Type': options.contentType,
    });
    await fetch(
      this.apiUrl +
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

  async createRelationship(input: j1GraphQL.CreateRelationshipInput) {
    return makeGraphQLRequest({
      j1Client: this,
      input,
      query: j1GraphQL.MUTATION_CREATE_RELATIONSHIP,
    });
  }

  async createEntity(input: j1GraphQL.CreateEntityInput) {
    return makeGraphQLRequest({
      j1Client: this,
      input,
      query: j1GraphQL.MUTATION_CREATE_ENTITY,
    });
  }

  async updateEntity(input: j1GraphQL.UpdateEntityInput) {
    return makeGraphQLRequest({
      j1Client: this,
      input,
      query: j1GraphQL.MUTATION_UPDATE_ENTITY,
    });
  }
}

export function createJupiterOneClient(options: J1Options) {
  return new JupiterOneClient(options);
}

export type { JupiterOneClient };
