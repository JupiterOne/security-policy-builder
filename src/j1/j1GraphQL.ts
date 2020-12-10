import gql from 'graphql-tag';
import { EntityPropertyValue, Entity, Relationship } from '~/src/j1/types';
import { JupiterOneQuery as JupiterOneGraphQLQuery } from '~/src/j1';
import { PolicyBuilderConfig } from '../types';

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

export type UpdateRelationshipInput = {
  timestamp: number;
  relationship: Partial<Relationship> & {
    _id: string;
  };
};

export type UpdateRelationshipOutput = {
  relationship: Relationship;
};

export const MUTATION_UPDATE_RELATIONSHIP: JupiterOneGraphQLQuery<
  UpdateRelationshipInput,
  UpdateRelationshipOutput
> = {
  nameForLogging: 'Update Relationship',
  ast: gql`
    mutation UpdateRelationshipV2($timestamp: Long, $relationship: JSON!) {
      result: updateRelationshipV2(
        timestamp: $timestamp
        relationship: $relationship
      ) {
        relationship
      }
    }
  `,
};

export type UpdateConfigInput = {
  values: PolicyBuilderConfig['organization'];
};

export type UpdateConfigOutput = {
  values: {
    config: PolicyBuilderConfig['organization'];
  };
};

export const MUTATION_UPDATE_CONFIG: JupiterOneGraphQLQuery<
  UpdateRelationshipInput,
  UpdateRelationshipOutput
> = {
  nameForLogging: 'Update Config',
  ast: gql`
    mutation updateCompanyValues($values: JSON!) {
      updateCompanyValues(values: $values) {
        values
      }
    }
  `,
};
