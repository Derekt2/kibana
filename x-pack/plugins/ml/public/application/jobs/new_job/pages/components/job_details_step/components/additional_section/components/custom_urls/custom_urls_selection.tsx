/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { FC, useContext } from 'react';
import { CustomUrls } from '../../../../../../../../../components/custom_urls/custom_urls';
import { UrlConfig } from '../../../../../../../../../../../common/types/custom_urls';
import { JobCreatorContext } from '../../../../../job_creator_context';
import { Description } from './description';
import { CombinedJob } from '../../../../../../../../../../../common/types/anomaly_detection_jobs';

export const CustomUrlsSelection: FC = () => {
  const { jobCreator, jobCreatorUpdate } = useContext(JobCreatorContext);

  const setCustomUrls = (customUrls: UrlConfig[]) => {
    jobCreator.customUrls = customUrls;
    jobCreatorUpdate();
  };

  const combinedJob: CombinedJob = {
    ...jobCreator.jobConfig,
    datafeed_config: jobCreator.datafeedConfig,
  };

  return (
    <Description>
      <CustomUrls
        job={combinedJob}
        jobCustomUrls={jobCreator.customUrls ?? []}
        setCustomUrls={setCustomUrls}
        editMode="modal"
      />
    </Description>
  );
};
