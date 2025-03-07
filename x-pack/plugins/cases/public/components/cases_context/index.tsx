/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Dispatch, ReactNode } from 'react';

import { merge } from 'lodash';
import React, { useCallback, useEffect, useState, useReducer } from 'react';
import useDeepCompareEffect from 'react-use/lib/useDeepCompareEffect';

import type { ScopedFilesClient } from '@kbn/files-plugin/public';

import { FilesContext } from '@kbn/shared-ux-file-context';

import type { CasesContextStoreAction } from './cases_context_reducer';
import type {
  CasesFeaturesAllRequired,
  CasesFeatures,
  CasesPermissions,
} from '../../containers/types';
import type { ReleasePhase } from '../types';
import type { ExternalReferenceAttachmentTypeRegistry } from '../../client/attachment_framework/external_reference_registry';
import type { PersistableStateAttachmentTypeRegistry } from '../../client/attachment_framework/persistable_state_registry';

import { CasesGlobalComponents } from './cases_global_components';
import { DEFAULT_FEATURES } from '../../../common/constants';
import { constructFileKindIdByOwner } from '../../../common/files';
import { DEFAULT_BASE_PATH } from '../../common/navigation';
import { useApplication } from './use_application';
import { casesContextReducer, getInitialCasesContextState } from './cases_context_reducer';
import { isRegisteredOwner } from '../../files';

export type CasesContextValueDispatch = Dispatch<CasesContextStoreAction>;

export interface CasesContextValue {
  externalReferenceAttachmentTypeRegistry: ExternalReferenceAttachmentTypeRegistry;
  persistableStateAttachmentTypeRegistry: PersistableStateAttachmentTypeRegistry;
  owner: string[];
  appId: string;
  appTitle: string;
  permissions: CasesPermissions;
  basePath: string;
  features: CasesFeaturesAllRequired;
  releasePhase: ReleasePhase;
  dispatch: CasesContextValueDispatch;
}

export interface CasesContextProps
  extends Pick<
    CasesContextValue,
    | 'owner'
    | 'permissions'
    | 'externalReferenceAttachmentTypeRegistry'
    | 'persistableStateAttachmentTypeRegistry'
  > {
  basePath?: string;
  features?: CasesFeatures;
  releasePhase?: ReleasePhase;
  getFilesClient: (scope: string) => ScopedFilesClient;
}

export const CasesContext = React.createContext<CasesContextValue | undefined>(undefined);

export interface CasesContextStateValue extends Omit<CasesContextValue, 'appId' | 'appTitle'> {
  appId?: string;
  appTitle?: string;
}

export const CasesProvider: React.FC<{ value: CasesContextProps }> = ({
  children,
  value: {
    externalReferenceAttachmentTypeRegistry,
    persistableStateAttachmentTypeRegistry,
    owner,
    permissions,
    basePath = DEFAULT_BASE_PATH,
    features = {},
    releasePhase = 'ga',
    getFilesClient,
  },
}) => {
  const { appId, appTitle } = useApplication();
  const [state, dispatch] = useReducer(casesContextReducer, getInitialCasesContextState());
  const [value, setValue] = useState<CasesContextStateValue>(() => ({
    externalReferenceAttachmentTypeRegistry,
    persistableStateAttachmentTypeRegistry,
    owner,
    permissions,
    basePath,
    /**
     * The empty object at the beginning avoids the mutation
     * of the DEFAULT_FEATURES object
     */
    features: merge<object, CasesFeaturesAllRequired, CasesFeatures>(
      {},
      DEFAULT_FEATURES,
      features
    ),
    releasePhase,
    dispatch,
  }));

  /**
   * Only update the context if the nested permissions fields changed, this avoids a rerender when the object's reference
   * changes.
   */
  useDeepCompareEffect(() => {
    setValue((prev) => ({ ...prev, permissions }));
  }, [permissions]);

  /**
   * `appId` and `appTitle` are dynamically retrieved from kibana context.
   * We need to update the state if any of these values change, the rest of props are never updated.
   */
  useEffect(() => {
    if (appId && appTitle) {
      setValue((prev) => ({
        ...prev,
        appId,
        appTitle,
      }));
    }
  }, [appTitle, appId]);

  const applyFilesContext = useCallback(
    (contextChildren: ReactNode) => {
      if (owner.length === 0) {
        return contextChildren;
      }

      if (isRegisteredOwner(owner[0])) {
        return (
          <FilesContext client={getFilesClient(constructFileKindIdByOwner(owner[0]))}>
            {contextChildren}
          </FilesContext>
        );
      } else {
        throw new Error(
          'Invalid owner provided to cases context. See https://github.com/elastic/kibana/blob/main/x-pack/plugins/cases/README.md#casescontext-setup'
        );
      }
    },
    [getFilesClient, owner]
  );

  return isCasesContextValue(value) ? (
    <CasesContext.Provider value={value}>
      {applyFilesContext(
        <>
          <CasesGlobalComponents state={state} />
          {children}
        </>
      )}
    </CasesContext.Provider>
  ) : null;
};
CasesProvider.displayName = 'CasesProvider';

function isCasesContextValue(value: CasesContextStateValue): value is CasesContextValue {
  return value.appId != null && value.appTitle != null && value.permissions != null;
}

// eslint-disable-next-line import/no-default-export
export default CasesProvider;
