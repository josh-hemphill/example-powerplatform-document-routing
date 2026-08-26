<script setup lang="ts">
import type { ReviewComment } from '@/client/types.gen';
import { computed, ref } from 'vue';
import {
	AUTHORITATIVE_RESPONSE_MIN_LENGTH,
	groupReviewComments,
} from '@/domain/review-comments';

const props = defineProps<{
	comments: ReviewComment[];
	canRespond: boolean;
	canWithdraw: boolean;
	isResponding: boolean;
	isAcknowledging: boolean;
	isWithdrawing: boolean;
	status: string;
	expanded: boolean;
	showAsRecord?: boolean;
}>();

const emit = defineEmits<{
	respond: [commentId: string, body: string];
	acknowledge: [commentId: string];
	withdraw: [];
	toggle: [];
}>();

const drafts = defineModel<Record<string, string>>('drafts', { required: true });

const addressedOpen = ref(false);

const grouped = computed(() => groupReviewComments(props.comments));

const openAuthoritativeCount = computed(
	() => grouped.value.unresolvedAuthoritative.length,
);

const dateTime = new Intl.DateTimeFormat(undefined, {
	dateStyle: 'short',
	timeStyle: 'short',
});

function formatTime(value: string): string {
	return dateTime.format(new Date(value));
}

function authorityColor(level: string): string {
	if (level === 'authoritative') {
		return 'error';
	}
	if (level === 'standard') {
		return 'warning';
	}
	return 'default';
}

function authorityLabel(level: string): string {
	if (level === 'authoritative') {
		return 'Authoritative';
	}
	if (level === 'standard') {
		return 'Standard';
	}
	return 'Advisory';
}

function draftFor(id: string): string {
	return drafts.value[id] ?? '';
}

function setDraft(id: string, value: string): void {
	drafts.value[id] = value;
}

function canSendResponse(comment: { id: string; authorityLevel: string }): boolean {
	const body = draftFor(comment.id).trim();
	if (comment.authorityLevel === 'authoritative') {
		return body.length >= AUTHORITATIVE_RESPONSE_MIN_LENGTH;
	}
	return body.length > 0;
}
</script>

<template>
	<section
		id="review-feedback"
		class="mb-4"
		aria-labelledby="review-feedback-heading"
	>
		<v-card class="pa-4">
			<div class="d-flex align-center justify-space-between ga-2 mb-2">
				<h2
					id="review-feedback-heading"
					class="text-subtitle-1 font-weight-bold mb-0"
				>
					{{ showAsRecord ? 'Review record' : 'Review feedback' }}
				</h2>
				<v-btn
					variant="text"
					size="small"
					:icon="expanded ? '$chevronUp' : '$chevronDown'"
					:aria-label="expanded ? 'Collapse review feedback' : 'Expand review feedback'"
					:aria-expanded="expanded"
					@click="emit('toggle')"
				/>
			</div>

			<p
				v-if="!expanded"
				class="text-body-2 text-medium-emphasis mb-0"
			>
				<template v-if="openAuthoritativeCount > 0">
					{{ openAuthoritativeCount }} open authoritative
					{{ openAuthoritativeCount === 1 ? 'comment' : 'comments' }}
				</template>
				<template v-else-if="comments.length > 0">
					{{ comments.length }} review
					{{ comments.length === 1 ? 'comment' : 'comments' }}
				</template>
				<template v-else>
					No review comments yet
				</template>
			</p>

			<v-expand-transition>
				<div v-if="expanded">
					<p
						v-if="comments.filter((item) => item.kind === 'decision').length === 0"
						class="text-body-2 text-medium-emphasis mb-0"
					>
						No review comments yet. Approver decisions will appear here and survive withdraw &amp; revise.
					</p>

					<template v-else>
						<div
							v-if="grouped.unresolvedAuthoritative.length"
							class="mb-4"
						>
							<div class="text-caption font-weight-bold text-error mb-2">
								Unresolved — authoritative (blocking)
							</div>
							<v-card
								v-for="comment in grouped.unresolvedAuthoritative"
								:key="comment.id"
								variant="tonal"
								color="error"
								class="pa-3 mb-3"
								:role="status === 'rejected' ? 'status' : undefined"
							>
								<div class="d-flex flex-wrap align-center ga-2 mb-1">
									<v-chip
										size="x-small"
										:color="authorityColor(comment.authorityLevel)"
										variant="flat"
									>
										{{ authorityLabel(comment.authorityLevel) }}
									</v-chip>
									<span class="text-body-2 font-weight-medium">
										{{ comment.role || 'Reviewer' }}
									</span>
									<span class="text-caption text-medium-emphasis">
										{{ comment.actorDisplayName }}
										· {{ formatTime(comment.createdAt) }}
										<template v-if="comment.submittedContentRevision != null">
											· revision {{ comment.submittedContentRevision }}
										</template>
									</span>
								</div>
								<p class="text-body-2 mb-3">
									{{ comment.body }}
								</p>
								<template v-if="canRespond">
									<v-textarea
										:model-value="draftFor(comment.id)"
										label="Author response (required)"
										:hint="`At least ${AUTHORITATIVE_RESPONSE_MIN_LENGTH} characters`"
										persistent-hint
										rows="3"
										class="mb-2"
										@update:model-value="(value) => setDraft(comment.id, String(value ?? ''))"
									/>
									<v-btn
										color="primary"
										size="small"
										:disabled="!canSendResponse(comment) || isResponding"
										:loading="isResponding"
										@click="emit('respond', comment.id, draftFor(comment.id))"
									>
										Save response
									</v-btn>
								</template>
							</v-card>
						</div>

						<div
							v-if="grouped.unresolvedStandard.length || grouped.unresolvedAdvisory.length"
							class="mb-4"
						>
							<div class="text-caption font-weight-bold mb-2">
								Unresolved — standard
							</div>
							<v-card
								v-for="comment in [...grouped.unresolvedStandard, ...grouped.unresolvedAdvisory]"
								:key="comment.id"
								variant="outlined"
								class="pa-3 mb-3"
							>
								<div class="d-flex flex-wrap align-center ga-2 mb-1">
									<v-chip
										size="x-small"
										:color="authorityColor(comment.authorityLevel)"
										variant="tonal"
									>
										{{ authorityLabel(comment.authorityLevel) }}
									</v-chip>
									<span class="text-body-2 font-weight-medium">
										{{ comment.role || 'Reviewer' }}
									</span>
									<span class="text-caption text-medium-emphasis">
										{{ comment.actorDisplayName }}
										· {{ formatTime(comment.createdAt) }}
									</span>
								</div>
								<p class="text-body-2 mb-3">
									{{ comment.body }}
								</p>
								<div
									v-if="canRespond && comment.authorityLevel === 'standard'"
									class="d-flex flex-wrap ga-2"
								>
									<v-textarea
										:model-value="draftFor(comment.id)"
										label="Optional reply"
										rows="2"
										class="mb-0"
										hide-details
										@update:model-value="(value) => setDraft(comment.id, String(value ?? ''))"
									/>
									<v-btn
										size="small"
										color="primary"
										variant="tonal"
										:disabled="!canSendResponse(comment) || isResponding"
										:loading="isResponding"
										@click="emit('respond', comment.id, draftFor(comment.id))"
									>
										Reply
									</v-btn>
									<v-btn
										size="small"
										variant="text"
										:disabled="isAcknowledging"
										:loading="isAcknowledging"
										@click="emit('acknowledge', comment.id)"
									>
										Acknowledge
									</v-btn>
								</div>
							</v-card>
						</div>

						<div v-if="grouped.addressed.length">
							<button
								type="button"
								class="text-caption font-weight-bold stage-toggle mb-2"
								:aria-expanded="addressedOpen"
								@click="addressedOpen = !addressedOpen"
							>
								Addressed ({{ grouped.addressed.length }})
							</button>
							<v-expand-transition>
								<div v-if="addressedOpen">
									<v-card
										v-for="comment in grouped.addressed"
										:key="comment.id"
										variant="text"
										class="pa-3 mb-2"
									>
										<div class="text-caption text-medium-emphasis mb-1">
											{{ authorityLabel(comment.authorityLevel) }}
											· {{ comment.role || 'Reviewer' }}
											· {{ comment.status }}
										</div>
										<p class="text-body-2 mb-0">
											{{ comment.body }}
										</p>
									</v-card>
								</div>
							</v-expand-transition>
						</div>

						<div
							v-if="canWithdraw && openAuthoritativeCount > 0 && status === 'rejected'"
							class="mt-4"
						>
							<v-btn
								color="secondary"
								variant="tonal"
								:disabled="isWithdrawing"
								:loading="isWithdrawing"
								@click="emit('withdraw')"
							>
								Withdraw &amp; revise to address feedback
							</v-btn>
							<p class="text-caption text-medium-emphasis mt-2 mb-0">
								{{ openAuthoritativeCount }}
								authoritative
								{{ openAuthoritativeCount === 1 ? 'comment' : 'comments' }}
								must be answered before resubmit.
							</p>
						</div>
					</template>
				</div>
			</v-expand-transition>
		</v-card>
	</section>
</template>

<style scoped>
.stage-toggle {
	background: none;
	border: 0;
	padding: 0;
	cursor: pointer;
	text-align: start;
	color: inherit;
	font: inherit;
}

.stage-toggle:focus-visible {
	outline: 2px solid rgb(var(--v-theme-primary));
	outline-offset: 2px;
}
</style>
