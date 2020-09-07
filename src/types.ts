import { Opaque } from 'type-fest';

export interface PolicyBuilderElement {
  id: string;
  file: string;
  name?: string;
  type?: ProcedureType;
  provider?: string;
  summary?: string;
  guidance?: string;
  applicable?: boolean;
  resources?: Resource[];
  adopted?: boolean;
  procedures?: string[];
  webLink?: string;
}

export interface PolicyBuilderConfig {
  organization: Organization;
  standards?: PolicyBuilderElement[];
  policies?: PolicyBuilderElement[];
  procedures?: PolicyBuilderElement[];
  references?: PolicyBuilderElement[];
}

export type PolicyBuilderCollectionName =
  | 'standards'
  | 'policies'
  | 'procedures'
  | 'references';

export type PolicyBuilderPaths = {
  output: string;
  templates?: string;
  partials: string;
};

export interface HipaaConfig {
  isHIPAACoveredEntity: boolean;
  isHIPAABusinessAssociate: boolean;
  isHIPAAGovernmentEntity: boolean;
  isHIPAAPlanSponsor: boolean;
  isHIPAAHealthcareClearinghouse: boolean;
}

export interface HipaaAssessmentConfig {
  hasHIPAATrainingGap: boolean;
  hasInfoSecTrainingGap: boolean;
  hasRiskAssessmentGap: boolean;
  hasPenTestGap: boolean;
  lastPenTestDate: boolean;
  lastPenTestProvider: boolean;
  penTestFrequency: boolean;
  nextPenTestDate: boolean;
  hadDataBreach: boolean;
}

export interface Organization extends Partial<HipaaConfig> {
  companyFullName?: string;
  companyShortName?: string;
  companyEmailDomain?: string;
  companyWebsiteURL?: string;
  companyMailingAddress?: string;
  companyOverview?: string;
  contactPhoneNumber?: string;
  ceoName?: string;
  ceoEmail?: string;
  cooName?: string;
  cooEmail?: string;
  ctoName?: string;
  ctoEmail?: string;
  securityOfficerName?: string;
  securityOfficerEmail?: string;
  privacyOfficerName?: string;
  privacyOfficerEmail?: string;
  securityCommitteeMembers?: string;
  wantCustomMkdocsTemplate?: boolean;
  mkdocsLogoURL?: string;
  mkdocsThemeColorPrimary?: string;
  mkdocsThemeColorAccent?: string;
  securityPolicyURL?: string;
  privacyPolicyURL?: string;
  cookiePolicyURL?: string;
  sourceControl?: string;
  ticketingSystem?: string;
  internalHelpdeskURL?: string;
  cmPortal?: string;
  ciSystem?: string;
  hrSystem?: string;
  supportBYODandMDM?: boolean;
  haveSecurityScorecard?: boolean;
  securityScorecardPeriod?: string;
  securityScorecardURL?: string;
  expenseReporting?: string;
  devWikiURL?: string;
  hipaaTrainingURL?: string;
  statusPageURL?: string;
  securityAwarenessTrainingProvider?: string;
  IdP?: string;
  CPA?: string;
  needStandardHIPAA?: boolean;
  needStandardHITRUST?: boolean;
  needStandardGDPR?: boolean;
  needStandardNIST?: boolean;
  needStandardPCI?: boolean;
  isServiceProvider?: boolean;
  mkdocsLogoFile?: string;
  defaultRevision?: string;
}

export type ProcedureId = Opaque<string, 'ProcedureId'>;

export type AdoptedPolicyBuilderElements = {
  standards: PolicyBuilderElement[];
  policies: PolicyBuilderElement[];
  procedures: PolicyBuilderElement[];
  references: PolicyBuilderElement[];
};

export interface Resource {
  name?: string;
  link?: string;
}

export enum ProcedureType {
  Administrative = 'administrative',
  Informational = 'informational',
  Operational = 'operational',
  Physical = 'physical',
  Technical = 'technical',
}

export type PolicyBuilderQuestion = {
  type: 'input' | 'confirm' | 'list';
  name: keyof Organization;
  message: string;
  choices?: () => string[];
  validate?: (value: string) => boolean | string;
  default?: boolean | string;
  when?: (answers: Record<string, boolean>) => boolean;
};

export type PolicyAssessmentQuestion = {
  type: 'input' | 'confirm' | 'list';
  name: keyof HipaaAssessmentConfig;
  message: string;
  choices?: () => string[];
  validate?: (value: string) => boolean | string;
  default?: boolean | string;
  when?: (answers: Record<string, boolean>) => boolean;
};

export type Gap = {
  ref: string;
  title: string;
};

export type PolicyBuilderStatus = {
  ok: string[];
  errors: string[];
  type: string;
};

export type PolicyBuilderPartialType = 'policies' | 'procedures' | 'references';
export type PolicyBuilderPartial = Omit<PolicyBuilderElement, 'type'> & {
  tFile?: string;
  type: PolicyBuilderPartialType;
};

export type StandardName = string;

export type AssessmentAnswers = Partial<HipaaAssessmentConfig>;
export type AssessmentInput = Organization &
  AssessmentAnswers & {
    date: Date;
    isHIPAACoveredEntityText: string;
    isHIPAABusinessAssociateText: string;
  };

export type ControlsMappings = {
  procedures: {
    id: string;
    implements: {
      standard: string;
      requirements: string[];
      controls: string[];
    }[];
  }[];
};

export type AnnotatedRefs = Record<string, StandardRequirement[]>;

export type StandardRequirement = {
  ref: string;
  title: string;
  summary: string;
  appliesIf?: string;
  hasGap?: boolean;
  noadoption?: boolean;
  adoptedCPs?: PolicyBuilderElement[];
  unAdoptedCPs?: PolicyBuilderElement[];
};

export type StandardConfig = {
  standard: string;
  version: string;
  webLink: string;
  sections: {
    title: string;
    requirements: StandardRequirement[];
  }[];
};
