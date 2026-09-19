import getNoteSummary from '../../misc/get-note-summary';
import getUserName from '../../misc/get-user-name';

type Notification = {
	title: string;
	body: string;
	icon: string;
	url?: string;
	onclick?: any;
};

// TODO: i18n

export default function(type, data): Notification | null {
	switch (type) {
		case 'driveFileCreated':
			return {
				title: 'File uploaded',
				body: data.name,
				icon: data.url
			};

		case 'notification':
			return composeUserNotification(data);

		default:
			return null;
	}
}

function composeUserNotification(data): Notification | null {
	// packされた通知には通知の発生元のユーザーが必ず入っている
	if (data == null || data.user == null) return null;

	const userName = getUserName(data.user);
	const icon = data.user.avatarUrl;
	const url = data.note ? `/notes/${data.note.id}` : `/@${data.user.username}`;

	switch (data.type) {
		case 'mention':
			return {
				title: `${userName}:`,
				body: getNoteSummary(data.note),
				icon, url
			};

		case 'reply':
			return {
				title: `You got reply from ${userName}:`,
				body: getNoteSummary(data.note),
				icon, url
			};

		case 'quote':
			return {
				title: `${userName} quoted your post:`,
				body: getNoteSummary(data.note),
				icon, url
			};

		case 'renote':
			return {
				title: `${userName} renoted your post:`,
				body: getNoteSummary(data.note),
				icon, url
			};

		case 'reaction':
			return {
				title: `${userName}: ${data.reaction}`,
				body: getNoteSummary(data.note),
				icon, url
			};

		case 'pollVote':
			return {
				title: `${userName} voted on your poll:`,
				body: getNoteSummary(data.note),
				icon, url
			};

		case 'follow':
			return {
				title: `${userName} followed you`,
				body: '',
				icon, url
			};

		case 'receiveFollowRequest':
			return {
				title: `${userName} sent you a follow request`,
				body: '',
				icon, url
			};

		default:
			return null;
	}
}
