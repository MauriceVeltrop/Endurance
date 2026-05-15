// TRAINING INVITES FOUNDATION PATCH
// Add Team Up partner invites to the training detail page.
//
// Main additions:
// 1. Load accepted training partners
// 2. Show invite section for creator only
// 3. Insert into training_invites
// 4. Prevent duplicate invites
//
// Suggested state additions:
//
// const [teamPartners, setTeamPartners] = useState([]);
// const [trainingInvites, setTrainingInvites] = useState([]);
// const [inviteBusyId, setInviteBusyId] = useState("");
// const [inviteMessage, setInviteMessage] = useState("");
//
// Suggested feature:
// Creator can invite accepted Team Up partners directly from /trainings/[id]
