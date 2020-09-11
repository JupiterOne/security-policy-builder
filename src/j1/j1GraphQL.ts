import gql from 'graphql-tag';
import {
  EntityPropertyValue,
  EntityProperties,
  RelationshipProperties,
  Entity,
  Relationship,
} from '~/src/j1/types';
import { JupiterOneQuery as JupiterOneGraphQLQuery } from '~/src/j1';

export type J1QLVariables = Record<string, EntityPropertyValue>;

export type DeferredJ1QLInput = {
  query: string;
  variables?: J1QLVariables;
};

export type DeferredJ1QLOutput = {
  url: string;
};

export const QUERY_DEFERRED_J1QL: JupiterOneGraphQLQuery<
  DeferredJ1QLInput,
  DeferredJ1QLOutput
> = {
  nameForLogging: 'Deferred J1QL Query',
  ast: gql`
    query J1QL($query: String!, $variables: JSON) {
      result: queryV1(
        query: $query
        variables: $variables
        remember: false
        includeDeleted: false
        deferredResponse: FORCE
      ) {
        url
      }
    }
  `,
};

export type CreateEntityInput = {
  timestamp: number;
  entity: EntityProperties & {
    _key: string;
    _class: string | string[];
    _type: string;
    displayName: string;
  };
};

export type CreateEntityOutput = {
  entity: Entity;
};

export const MUTATION_CREATE_ENTITY: JupiterOneGraphQLQuery<
  CreateEntityInput,
  CreateEntityOutput
> = {
  nameForLogging: 'Create Entity',
  ast: gql`
    mutation CreateEntityV2($timestamp: Long, $entity: JSON!) {
      result: createEntityV2(
        input: { timestamp: $timestamp, entity: $entity }
      ) {
        entity
      }
    }
  `,
};

export type UpdateEntityInput = {
  timestamp: number;
  entity: Partial<Entity> & {
    _id: string;
  };
};

export type UpdateEntityOutput = {
  entity: Entity;
};

export const MUTATION_UPDATE_ENTITY: JupiterOneGraphQLQuery<
  UpdateEntityInput,
  UpdateEntityOutput
> = {
  nameForLogging: 'Update Entity',
  ast: gql`
    mutation UpdateEntityV2($timestamp: Long, $entity: JSON!) {
      result: updateEntityV2(timestamp: $timestamp, entity: $entity) {
        entity
      }
    }
  `,
};

export type CreateRelationshipInput = {
  timestamp: number;
  relationship: RelationshipProperties & {
    _key: string;
    _class: string;
    _type: string;
    displayName: string;
    _fromEntityId: string;
    _toEntityId: string;
  };
};

export type CreateRelationshipOutput = {
  relationship: Relationship;
};

export const MUTATION_CREATE_RELATIONSHIP: JupiterOneGraphQLQuery<
  CreateRelationshipInput,
  CreateRelationshipOutput
> = {
  nameForLogging: 'Create Relationship',
  ast: gql`
    mutation CreateRelationshipV2($timestamp: Long, $relationship: JSON!) {
      result: createRelationshipV2(
        input: { timestamp: $timestamp, relationship: $relationship }
      ) {
        relationship
      }
    }
  `,
};
