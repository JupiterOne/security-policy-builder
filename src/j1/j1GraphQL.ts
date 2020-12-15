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
  UpdateConfigInput,
  UpdateConfigOutput
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

export type UpsertPolicyInput = {
  data: {
    id: string;
    file: string;
    title: string;
    template: string;
  };
};

export type UpsertPolicyOutput = {
  uuid: string;
};

export const MUTATION_UPSERT_POLICY: JupiterOneGraphQLQuery<
  UpsertPolicyInput,
  UpsertPolicyOutput
> = {
  nameForLogging: 'Upsert Policy',
  ast: gql`
    mutation upsertPolicyById($data: CreatePolicyInput!) {
      upsertPolicyById(data: $data) {
        uuid
      }
    }
  `,
};

export type UpsertProcedureInput = {
  data: {
    id: string;
    file: string;
    name: string;
    policyId: string;
    template: string;
    provider?: string;
    isRef?: boolean;
    applicable?: boolean;
    adopted?: boolean;
    summary: string;
  };
};

export type UpsertProcedureOutput = {
  uuid: string;
};

export const MUTATION_UPSERT_PROCEDURE: JupiterOneGraphQLQuery<
  UpsertPolicyInput,
  UpsertPolicyOutput
> = {
  nameForLogging: 'Upsert Policy',
  ast: gql`
    mutation upsertProcedureById($data: CreateProcedureInput!) {
      upsertProcedureById(data: $data) {
        uuid
      }
    }
  `,
};

export type ReorderAllItemsByMappingInput = {
  mapping: { policies: { id: string; procedures: string[] }[] };
};

export type ReorderAllItemsByMappingOutput = {
  uuid: string;
};

export const MUTATION_REORDER_ITEMS: JupiterOneGraphQLQuery<
  ReorderAllItemsByMappingInput,
  ReorderAllItemsByMappingOutput
> = {
  nameForLogging: 'Upsert Policy',
  ast: gql`
    mutation reorderAllItemsByMapping($mapping: PolicyMappingInput!) {
      reorderAllItemsByMapping(mapping: $mapping) {
        policies {
          id
        }
      }
    }
  `,
};
