/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useEffect, useState } from 'react';
import { FormProvider, useForm } from 'react-hook-form';
import { useLocation, useHistory } from 'react-router-dom';
import {
  EuiButton,
  EuiCheckbox,
  EuiFlexGroup,
  EuiIconTip,
  EuiSpacer,
  EuiSteps,
} from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import type { CreateSLOInput, SLOWithSummaryResponse } from '@kbn/slo-schema';
import { createKbnUrlStateStorage } from '@kbn/kibana-utils-plugin/public';

import { useKibana } from '../../../utils/kibana_react';
import { useCreateSlo } from '../../../hooks/slo/use_create_slo';
import { useUpdateSlo } from '../../../hooks/slo/use_update_slo';
import { useShowSections } from '../hooks/use_show_sections';
import { useFetchRulesForSlo } from '../../../hooks/slo/use_fetch_rules_for_slo';
import { useSectionFormValidation } from '../helpers/use_section_form_validation';
import { SloEditFormDescriptionSection } from './slo_edit_form_description_section';
import { SloEditFormObjectiveSection } from './slo_edit_form_objective_section';
import { SloEditFormIndicatorSection } from './slo_edit_form_indicator_section';
import {
  transformValuesToCreateSLOInput,
  transformSloResponseToCreateSloInput,
  transformValuesToUpdateSLOInput,
} from '../helpers/process_slo_form_values';
import { paths } from '../../../config/paths';
import { SLO_BURN_RATE_RULE_ID } from '../../../../common/constants';
import { SLO_EDIT_FORM_DEFAULT_VALUES } from '../constants';
import { sloFeatureId } from '../../../../common';

export interface Props {
  slo: SLOWithSummaryResponse | undefined;
}

export const maxWidth = 775;

const CREATE_RULE_SEARCH_PARAM = 'create-rule';

export function SloEditForm({ slo }: Props) {
  const {
    application: { navigateToUrl },
    http: { basePath },
    notifications: { toasts },
    triggersActionsUi: { getAddRuleFlyout: AddRuleFlyout },
  } = useKibana().services;

  const history = useHistory();
  const { search } = useLocation();

  const { data: rules, isInitialLoading } = useFetchRulesForSlo({
    sloIds: slo?.id ? [slo.id] : undefined,
  });

  const urlStateStorage = createKbnUrlStateStorage({
    history,
    useHash: false,
    useHashQuery: false,
  });

  const urlParams = urlStateStorage.get<CreateSLOInput>('_a');

  const searchParams = new URLSearchParams(search);

  const isEditMode = slo !== undefined;

  const [isAddRuleFlyoutOpen, setIsAddRuleFlyoutOpen] = useState(false);
  const [isCreateRuleCheckboxChecked, setIsCreateRuleCheckboxChecked] = useState(true);

  if (searchParams.has(CREATE_RULE_SEARCH_PARAM) && isEditMode && !isAddRuleFlyoutOpen) {
    setIsAddRuleFlyoutOpen(true);
  }

  useEffect(() => {
    if (isEditMode && rules && rules[slo.id].length && isCreateRuleCheckboxChecked) {
      setIsCreateRuleCheckboxChecked(false);
    }
  }, [isCreateRuleCheckboxChecked, isEditMode, rules, slo]);

  const methods = useForm({
    defaultValues: { ...SLO_EDIT_FORM_DEFAULT_VALUES, ...urlParams },
    values: transformSloResponseToCreateSloInput(slo),
    mode: 'all',
  });
  const { watch, getFieldState, getValues, formState, trigger } = methods;

  const { isIndicatorSectionValid, isObjectiveSectionValid, isDescriptionSectionValid } =
    useSectionFormValidation({
      getFieldState,
      getValues,
      formState,
      watch,
    });

  const { showDescriptionSection, showObjectiveSection } = useShowSections(
    isEditMode,
    formState.isValidating,
    isIndicatorSectionValid,
    isObjectiveSectionValid
  );

  const { mutateAsync: createSlo, isLoading: isCreateSloLoading } = useCreateSlo();
  const { mutateAsync: updateSlo, isLoading: isUpdateSloLoading } = useUpdateSlo();

  const handleSubmit = async () => {
    const isValid = await trigger();
    if (!isValid) {
      return;
    }

    const values = getValues();

    if (isEditMode) {
      try {
        const processedValues = transformValuesToUpdateSLOInput(values);

        await updateSlo({ sloId: slo.id, slo: processedValues });

        toasts.addSuccess(
          i18n.translate('xpack.observability.slo.sloEdit.update.success', {
            defaultMessage: 'Successfully updated {name}',
            values: { name: getValues().name },
          })
        );

        if (isCreateRuleCheckboxChecked) {
          navigateToUrl(
            basePath.prepend(
              `${paths.observability.sloEdit(slo.id)}?${CREATE_RULE_SEARCH_PARAM}=true`
            )
          );
        } else {
          navigateToUrl(basePath.prepend(paths.observability.slos));
        }
      } catch (error) {
        toasts.addError(new Error(error), {
          title: i18n.translate('xpack.observability.slo.sloEdit.creation.error', {
            defaultMessage: 'Something went wrong',
          }),
        });
      }
    } else {
      try {
        const processedValues = transformValuesToCreateSLOInput(values);

        const { id } = await createSlo({ slo: processedValues });

        toasts.addSuccess(
          i18n.translate('xpack.observability.slo.sloEdit.creation.success', {
            defaultMessage: 'Successfully created {name}',
            values: { name: getValues().name },
          })
        );

        if (isCreateRuleCheckboxChecked) {
          navigateToUrl(
            basePath.prepend(`${paths.observability.sloEdit(id)}?${CREATE_RULE_SEARCH_PARAM}=true`)
          );
        } else {
          navigateToUrl(basePath.prepend(paths.observability.slos));
        }
      } catch (error) {
        toasts.addError(new Error(error), {
          title: i18n.translate('xpack.observability.slo.sloEdit.creation.error', {
            defaultMessage: 'Something went wrong',
          }),
        });
      }
    }
  };

  const handleChangeCheckbox = () => {
    setIsCreateRuleCheckboxChecked(!isCreateRuleCheckboxChecked);
  };

  const handleCloseRuleFlyout = async () => {
    navigateToUrl(basePath.prepend(paths.observability.slos));
  };

  return (
    <>
      <FormProvider {...methods}>
        <EuiFlexGroup direction="column" gutterSize="s" data-test-subj="sloForm">
          <EuiSteps
            steps={[
              {
                title: i18n.translate('xpack.observability.slo.sloEdit.definition.title', {
                  defaultMessage: 'Define SLI',
                }),
                children: <SloEditFormIndicatorSection />,
                status: isIndicatorSectionValid ? 'complete' : 'incomplete',
              },
              {
                title: i18n.translate('xpack.observability.slo.sloEdit.objectives.title', {
                  defaultMessage: 'Set objectives',
                }),
                children: showObjectiveSection ? <SloEditFormObjectiveSection /> : null,
                status: showObjectiveSection && isObjectiveSectionValid ? 'complete' : 'incomplete',
              },
              {
                title: i18n.translate('xpack.observability.slo.sloEdit.description.title', {
                  defaultMessage: 'Describe SLO',
                }),
                children: showDescriptionSection ? <SloEditFormDescriptionSection /> : null,
                status:
                  showDescriptionSection && isDescriptionSectionValid ? 'complete' : 'incomplete',
              },
            ]}
          />

          <EuiFlexGroup direction="row" gutterSize="s">
            <EuiCheckbox
              id="createNewRuleCheckbox"
              checked={isCreateRuleCheckboxChecked}
              disabled={isInitialLoading}
              data-test-subj="createNewRuleCheckbox"
              label={
                <>
                  <span>
                    {i18n.translate('xpack.observability.slo.sloEdit.createAlert.title', {
                      defaultMessage: 'Create an',
                    })}{' '}
                    <strong>
                      {i18n.translate('xpack.observability.slo.sloEdit.createAlert.ruleName', {
                        defaultMessage: 'SLO burn rate alert rule',
                      })}
                    </strong>
                  </span>{' '}
                  <EuiIconTip
                    content={
                      'Selecting this will allow you to create a new alert rule for this SLO upon saving.'
                    }
                    position="top"
                  />
                </>
              }
              onChange={handleChangeCheckbox}
            />
          </EuiFlexGroup>

          <EuiSpacer size="m" />

          <EuiFlexGroup direction="row" gutterSize="s">
            <EuiButton
              color="primary"
              data-test-subj="sloFormSubmitButton"
              fill
              isLoading={isCreateSloLoading || isUpdateSloLoading}
              onClick={handleSubmit}
            >
              {isEditMode
                ? i18n.translate('xpack.observability.slo.sloEdit.editSloButton', {
                    defaultMessage: 'Update SLO',
                  })
                : i18n.translate('xpack.observability.slo.sloEdit.createSloButton', {
                    defaultMessage: 'Create SLO',
                  })}
            </EuiButton>

            <EuiButton
              color="ghost"
              data-test-subj="sloFormCancelButton"
              fill
              disabled={isCreateSloLoading || isUpdateSloLoading}
              onClick={() => navigateToUrl(basePath.prepend(paths.observability.slos))}
            >
              {i18n.translate('xpack.observability.slo.sloEdit.cancelButton', {
                defaultMessage: 'Cancel',
              })}
            </EuiButton>
          </EuiFlexGroup>
        </EuiFlexGroup>
      </FormProvider>

      {isAddRuleFlyoutOpen && slo ? (
        <AddRuleFlyout
          canChangeTrigger={false}
          consumer={sloFeatureId}
          initialValues={{ name: `${slo.name} Burn Rate rule`, params: { sloId: slo.id } }}
          ruleTypeId={SLO_BURN_RATE_RULE_ID}
          onClose={handleCloseRuleFlyout}
          onSave={handleCloseRuleFlyout}
        />
      ) : null}
    </>
  );
}
