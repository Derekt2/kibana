/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { memo, useState, useCallback } from 'react';
import { EuiCallOut, EuiSpacer, EuiButtonEmpty } from '@elastic/eui';
import { FormattedMessage } from '@kbn/i18n-react';
import { i18n } from '@kbn/i18n';
import { useGetActionState } from '../../hooks';

export const MissingEncryptionKeyCallout = memo(() => {
  const { data: encryptionKeyState } = useGetActionState();
  const [calloutDismiss, setCalloutDismiss] = useState(false);

  const onClickDismissButton = useCallback(() => setCalloutDismiss(true), []);

  if (!encryptionKeyState) {
    return null;
  }

  if (calloutDismiss || encryptionKeyState.data.canEncrypt === true) {
    return null;
  }

  return (
    <>
      <EuiCallOut
        color="warning"
        iconType="iInCircle"
        data-test-subj="missingEncryptionKeyCallout"
        title={i18n.translate(
          'xpack.securitySolution.responder.missingEncryptionKey.callout.title',
          {
            defaultMessage: 'Set up encryption key',
          }
        )}
      >
        <div>
          <FormattedMessage
            id="xpack.securitySolution.responder.missingEncryptionKey.callout.body"
            defaultMessage="Encryption key will make your environment more secure"
          />
        </div>

        <EuiButtonEmpty
          onClick={onClickDismissButton}
          color="warning"
          data-test-subj="dismissEncryptionKeyCallout"
        >
          <FormattedMessage
            id="xpack.securitySolution.responder.missingEncryptionKey.callout.dismissButton.label"
            defaultMessage="Dismiss"
          />
        </EuiButtonEmpty>
      </EuiCallOut>
      <EuiSpacer size="m" />
    </>
  );
});

MissingEncryptionKeyCallout.displayName = 'MissingEncryptionKeyCallout';
