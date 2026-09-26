#!/usr/bin/env bash
# Spike 5 — email canary: prove the sandbox cannot send mail, and learn the exact result shape.
# Sends ONE email to YOUR address (ORGNAUTS_CANARY_EMAIL) with allOrNothing=false. Expected in a locked sandbox: NO_MASS_MAIL_PERMISSION.
set -euo pipefail
: "${ORGNAUTS_CANARY_EMAIL:?set ORGNAUTS_CANARY_EMAIL to YOUR OWN address}"
DEV="${DEV:-DevSandbox}"
echo "1) toolkit canary against $DEV"; orgnauts agent canary --org "$DEV" || true
echo "2) raw result shape (for the record)"
cat > /tmp/orgnauts-canary.apex <<APEX
Messaging.SingleEmailMessage m = new Messaging.SingleEmailMessage();
m.setToAddresses(new String[]{ '$ORGNAUTS_CANARY_EMAIL' });
m.setSubject('[Orgnauts canary] deliverability probe'); m.setPlainTextBody('If you receive this, deliverability is ON — turn it OFF (Setup → Email → Deliverability → No access / System email only).');
Messaging.SendEmailResult[] r = Messaging.sendEmail(new Messaging.SingleEmailMessage[]{ m }, false);
System.debug('ORGNAUTS_CANARY ' + JSON.serialize(r));
APEX
sf apex run --file /tmp/orgnauts-canary.apex -o "$DEV" --json | head -c 1500; echo
echo "3) Repeat for preprod WITH the engine keychain:  HOME=\$HOME/.orgnauts/engine sf apex run --file /tmp/orgnauts-canary.apex -o UAT --json"
echo "4) Screenshot Setup → Email → Deliverability in both orgs → spikes/5-email-canary/ (gitignored findings)."
