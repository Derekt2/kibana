/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  EuiFlexGroup,
  EuiFlexItem,
  EuiPanel,
  EuiProgress,
  EuiSpacer,
  EuiText,
  useIsWithinMaxBreakpoint,
  useIsWithinMinBreakpoint,
} from '@elastic/eui';
import React, { useCallback, useMemo } from 'react';
import type { Severity } from '@kbn/securitysolution-io-ts-alerting-types';
import styled from 'styled-components';

import { ALERT_WORKFLOW_STATUS, ALERT_SEVERITY } from '@kbn/rule-data-utils';
import { FILTER_OPEN, FILTER_ACKNOWLEDGED, FILTER_CLOSED } from '../../../../../common/types';
import { useNavigateToAlertsPageWithFilters } from '../../../../common/hooks/use_navigate_to_alerts_page_with_filters';
import type { ESBoolQuery } from '../../../../../common/typed_json';
import type { FillColor } from '../../../../common/components/charts/donutchart';
import { DonutChart } from '../../../../common/components/charts/donutchart';
import { SecurityPageName } from '../../../../../common/constants';
import { HeaderSection } from '../../../../common/components/header_section';
import { HoverVisibilityContainer } from '../../../../common/components/hover_visibility_container';
import { BUTTON_CLASS as INPECT_BUTTON_CLASS } from '../../../../common/components/inspect';
import type { LegendItem } from '../../../../common/components/charts/legend_item';
import type { EntityFilter } from './use_alerts_by_status';
import { useAlertsByStatus } from './use_alerts_by_status';
import {
  ALERTS,
  ALERTS_TEXT,
  ALERTS_BY_SEVERITY_TEXT,
  INVESTIGATE_IN_TIMELINE,
  OPEN_IN_ALERTS_TITLE_SEVERITY,
  OPEN_IN_ALERTS_TITLE_STATUS,
  STATUS_ACKNOWLEDGED,
  STATUS_CLOSED,
  STATUS_CRITICAL_LABEL,
  STATUS_HIGH_LABEL,
  STATUS_LOW_LABEL,
  STATUS_MEDIUM_LABEL,
  STATUS_OPEN,
} from '../translations';
import { useQueryToggle } from '../../../../common/containers/query_toggle';
import { VIEW_ALERTS } from '../../../pages/translations';
import { SEVERITY_COLOR } from '../utils';
import { FormattedCount } from '../../../../common/components/formatted_number';
import { ChartLabel } from './chart_label';
import { Legend } from '../../../../common/components/charts/legend';
import { emptyDonutColor } from '../../../../common/components/charts/donutchart_empty';
import { LastUpdatedAt } from '../../../../common/components/last_updated_at';
import { LinkButton, useGetSecuritySolutionLinkProps } from '../../../../common/components/links';
import { useNavigateToTimeline } from '../hooks/use_navigate_to_timeline';
import { useIsExperimentalFeatureEnabled } from '../../../../common/hooks/use_experimental_features';
import { useGlobalTime } from '../../../../common/containers/use_global_time';
import { useAlertsByStatusVisualizationData } from './use_alerts_by_status_visualization_data';
import { DETECTION_RESPONSE_ALERTS_BY_STATUS_ID } from './types';
import { SourcererScopeName } from '../../../../common/store/sourcerer/model';
import { VisualizationEmbeddable } from '../../../../common/components/visualization_actions/visualization_embeddable';
import type { Status } from '../../../../../common/detection_engine/schemas/common';
import { getAlertsByStatusAttributes } from '../../../../common/components/visualization_actions/lens_attributes/common/alerts/alerts_by_status_donut';

const StyledFlexItem = styled(EuiFlexItem)`
  padding: 0 4px;
`;

const StyledLegendFlexItem = styled(EuiFlexItem)`
  padding-left: 32px;
  padding-top: 45px;
`;

const ChartSize = '120px';

interface AlertsByStatusProps {
  additionalFilters?: ESBoolQuery[];
  applyGlobalQueriesAndFilters?: boolean;
  entityFilter?: EntityFilter;
  signalIndexName: string | null;
}

const chartConfigs: Array<{ key: Severity; label: string; color: string }> = [
  { key: 'critical', label: STATUS_CRITICAL_LABEL, color: SEVERITY_COLOR.critical },
  { key: 'high', label: STATUS_HIGH_LABEL, color: SEVERITY_COLOR.high },
  { key: 'medium', label: STATUS_MEDIUM_LABEL, color: SEVERITY_COLOR.medium },
  { key: 'low', label: STATUS_LOW_LABEL, color: SEVERITY_COLOR.low },
];

const eventKindSignalFilter: EntityFilter = {
  field: 'event.kind',
  value: 'signal',
};

const openDonutOptions = { status: 'open' as Status };
const acknowledgedDonutOptions = { status: 'acknowledged' as Status };
const closedDonutOptions = { status: 'closed' as Status };

export const AlertsByStatus = ({
  additionalFilters,
  applyGlobalQueriesAndFilters = true,
  signalIndexName,
  entityFilter,
}: AlertsByStatusProps) => {
  const { toggleStatus, setToggleStatus } = useQueryToggle(DETECTION_RESPONSE_ALERTS_BY_STATUS_ID);
  const { openTimelineWithFilters } = useNavigateToTimeline();
  const navigateToAlerts = useNavigateToAlertsPageWithFilters();
  const { onClick: goToAlerts, href } = useGetSecuritySolutionLinkProps()({
    deepLinkId: SecurityPageName.alerts,
  });

  const isDonutChartEmbeddablesEnabled = useIsExperimentalFeatureEnabled(
    'donutChartEmbeddablesEnabled'
  );
  const { to, from } = useGlobalTime();
  const timerange = useMemo(() => ({ from, to }), [from, to]);

  const isLargerBreakpoint = useIsWithinMinBreakpoint('xl');
  const isSmallBreakpoint = useIsWithinMaxBreakpoint('s');
  const donutHeight = isSmallBreakpoint || isLargerBreakpoint ? 120 : 90;

  const detailsButtonOptions = useMemo(
    () => ({
      name: entityFilter ? INVESTIGATE_IN_TIMELINE : VIEW_ALERTS,
      href: entityFilter ? undefined : href,
      onClick: entityFilter
        ? () => openTimelineWithFilters([[entityFilter, eventKindSignalFilter]])
        : goToAlerts,
    }),
    [entityFilter, href, goToAlerts, openTimelineWithFilters]
  );

  const {
    items: donutData,
    isLoading: loading,
    updatedAt,
  } = useAlertsByStatus({
    additionalFilters,
    entityFilter,
    signalIndexName,
    skip: !toggleStatus || isDonutChartEmbeddablesEnabled,
    queryId: DETECTION_RESPONSE_ALERTS_BY_STATUS_ID,
    to,
    from,
  });
  const legendItems: LegendItem[] = useMemo(
    () =>
      chartConfigs.map((d) => ({
        color: d.color,
        field: ALERT_SEVERITY,
        value: d.label,
      })),
    []
  );

  const navigateToAlertsWithStatus = useCallback(
    (status: Status, level?: string) =>
      navigateToAlerts([
        {
          title: OPEN_IN_ALERTS_TITLE_STATUS,
          selectedOptions: [status],
          fieldName: ALERT_WORKFLOW_STATUS,
        },
        ...(level
          ? [
              {
                title: OPEN_IN_ALERTS_TITLE_SEVERITY,
                selectedOptions: [level],
                fieldName: ALERT_SEVERITY,
              },
            ]
          : []),
        ...(entityFilter
          ? [
              {
                selectedOptions: [entityFilter.value],
                fieldName: entityFilter.field,
              },
            ]
          : []),
      ]),
    [entityFilter, navigateToAlerts]
  );

  const navigateToAlertsWithStatusOpen = useCallback(
    (level?: string) => navigateToAlertsWithStatus(FILTER_OPEN, level),
    [navigateToAlertsWithStatus]
  );

  const navigateToAlertsWithStatusAcknowledged = useCallback(
    (level?: string) => navigateToAlertsWithStatus(FILTER_ACKNOWLEDGED, level),
    [navigateToAlertsWithStatus]
  );

  const navigateToAlertsWithStatusClosed = useCallback(
    (level?: string) => navigateToAlertsWithStatus(FILTER_CLOSED, level),
    [navigateToAlertsWithStatus]
  );

  const openCount = donutData?.open?.total ?? 0;
  const acknowledgedCount = donutData?.acknowledged?.total ?? 0;
  const closedCount = donutData?.closed?.total ?? 0;

  const totalAlerts =
    loading || donutData == null ? 0 : openCount + acknowledgedCount + closedCount;

  const { total: visualizationTotalAlerts } = useAlertsByStatusVisualizationData();

  const totalAlertsCount = isDonutChartEmbeddablesEnabled ? visualizationTotalAlerts : totalAlerts;

  const fillColor: FillColor = useCallback((dataName) => {
    return chartConfigs.find((cfg) => cfg.label === dataName)?.color ?? emptyDonutColor;
  }, []);

  return (
    <>
      <HoverVisibilityContainer show={true} targetClassNames={[INPECT_BUTTON_CLASS]}>
        <EuiPanel hasBorder data-test-subj={`${DETECTION_RESPONSE_ALERTS_BY_STATUS_ID}-panel`}>
          {loading && (
            <EuiProgress
              data-test-subj="initialLoadingPanelMatrixOverTime"
              size="xs"
              position="absolute"
              color="accent"
            />
          )}
          <HeaderSection
            id={DETECTION_RESPONSE_ALERTS_BY_STATUS_ID}
            title={entityFilter ? ALERTS_BY_SEVERITY_TEXT : ALERTS_TEXT}
            titleSize="m"
            subtitle={<LastUpdatedAt isUpdating={loading} updatedAt={updatedAt} />}
            inspectMultiple
            toggleStatus={toggleStatus}
            toggleQuery={setToggleStatus}
            showInspectButton={!isDonutChartEmbeddablesEnabled}
          >
            <EuiFlexGroup alignItems="center" gutterSize="none">
              <EuiFlexItem grow={false}>
                <LinkButton
                  data-test-subj="view-details-button"
                  onClick={detailsButtonOptions.onClick}
                  href={detailsButtonOptions.href}
                >
                  {detailsButtonOptions.name}
                </LinkButton>
              </EuiFlexItem>
            </EuiFlexGroup>
          </HeaderSection>
          {toggleStatus && (
            <>
              <EuiFlexGroup justifyContent="center" gutterSize="none">
                <EuiFlexItem grow={isDonutChartEmbeddablesEnabled}>
                  <EuiText className="eui-textCenter" size="s">
                    {totalAlerts !== 0 ||
                      (visualizationTotalAlerts !== 0 && (
                        <>
                          <b>
                            <FormattedCount count={totalAlertsCount} />
                          </b>
                          <> </>
                          <small>{ALERTS(totalAlertsCount)}</small>
                        </>
                      ))}
                  </EuiText>

                  <EuiSpacer size="l" />
                  <EuiFlexGroup justifyContent="center">
                    <StyledFlexItem key="alerts-status-open" grow={isDonutChartEmbeddablesEnabled}>
                      {isDonutChartEmbeddablesEnabled ? (
                        <VisualizationEmbeddable
                          applyGlobalQueriesAndFilters={applyGlobalQueriesAndFilters}
                          extraOptions={openDonutOptions}
                          getLensAttributes={getAlertsByStatusAttributes}
                          height={ChartSize}
                          id={`${DETECTION_RESPONSE_ALERTS_BY_STATUS_ID}-open`}
                          isDonut={true}
                          label={STATUS_OPEN}
                          scopeId={SourcererScopeName.detections}
                          stackByField={ALERT_WORKFLOW_STATUS}
                          timerange={timerange}
                          width={ChartSize}
                        />
                      ) : (
                        <DonutChart
                          onPartitionClick={navigateToAlertsWithStatusOpen}
                          data={donutData?.open?.severities}
                          fillColor={fillColor}
                          height={donutHeight}
                          label={STATUS_OPEN}
                          title={
                            <ChartLabel
                              onClick={navigateToAlertsWithStatusOpen}
                              count={openCount}
                            />
                          }
                          totalCount={openCount}
                        />
                      )}
                    </StyledFlexItem>
                    <StyledFlexItem
                      key="alerts-status-acknowledged"
                      grow={isDonutChartEmbeddablesEnabled}
                    >
                      {isDonutChartEmbeddablesEnabled ? (
                        <VisualizationEmbeddable
                          applyGlobalQueriesAndFilters={applyGlobalQueriesAndFilters}
                          extraOptions={acknowledgedDonutOptions}
                          getLensAttributes={getAlertsByStatusAttributes}
                          height={ChartSize}
                          id={`${DETECTION_RESPONSE_ALERTS_BY_STATUS_ID}-acknowledged`}
                          isDonut={true}
                          label={STATUS_ACKNOWLEDGED}
                          scopeId={SourcererScopeName.detections}
                          stackByField={ALERT_WORKFLOW_STATUS}
                          timerange={timerange}
                          width={ChartSize}
                        />
                      ) : (
                        <DonutChart
                          data={donutData?.acknowledged?.severities}
                          fillColor={fillColor}
                          height={donutHeight}
                          label={STATUS_ACKNOWLEDGED}
                          onPartitionClick={navigateToAlertsWithStatusAcknowledged}
                          title={
                            <ChartLabel
                              onClick={navigateToAlertsWithStatusAcknowledged}
                              count={acknowledgedCount}
                            />
                          }
                          totalCount={acknowledgedCount}
                        />
                      )}
                    </StyledFlexItem>
                    <StyledFlexItem
                      key="alerts-status-closed"
                      grow={isDonutChartEmbeddablesEnabled}
                    >
                      {isDonutChartEmbeddablesEnabled ? (
                        <VisualizationEmbeddable
                          applyGlobalQueriesAndFilters={applyGlobalQueriesAndFilters}
                          extraOptions={closedDonutOptions}
                          getLensAttributes={getAlertsByStatusAttributes}
                          height={ChartSize}
                          id={`${DETECTION_RESPONSE_ALERTS_BY_STATUS_ID}-closed`}
                          isDonut={true}
                          label={STATUS_CLOSED}
                          scopeId={SourcererScopeName.detections}
                          stackByField={ALERT_WORKFLOW_STATUS}
                          timerange={timerange}
                          width={ChartSize}
                        />
                      ) : (
                        <DonutChart
                          data={donutData?.closed?.severities}
                          fillColor={fillColor}
                          height={donutHeight}
                          label={STATUS_CLOSED}
                          onPartitionClick={navigateToAlertsWithStatusClosed}
                          title={
                            <ChartLabel
                              onClick={navigateToAlertsWithStatusClosed}
                              count={closedCount}
                            />
                          }
                          totalCount={closedCount}
                        />
                      )}
                    </StyledFlexItem>
                  </EuiFlexGroup>
                </EuiFlexItem>
                {!isDonutChartEmbeddablesEnabled && (
                  <StyledLegendFlexItem grow={false}>
                    {legendItems.length > 0 && <Legend legendItems={legendItems} />}
                  </StyledLegendFlexItem>
                )}
              </EuiFlexGroup>
              <EuiSpacer size="m" />
            </>
          )}
        </EuiPanel>
      </HoverVisibilityContainer>
    </>
  );
};
