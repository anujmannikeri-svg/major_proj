/**
 * Pass/fail is determined by score percentage >= pass threshold percentage.
 */

function clampPct(n) {
    if (typeof n !== 'number' || Number.isNaN(n)) return null;
    return Math.min(100, Math.max(0, n));
}

/**
 * Threshold percentage (0–100) used to mark a submission as passed.
 * Prefers passPercentage; falls back to legacy passMarks vs totalMarks.
 */
function resolvePassPercentage(exam) {
    const obj = exam && typeof exam.toObject === 'function' ? exam.toObject() : (exam || {});
    const direct = clampPct(obj.passPercentage);
    if (direct !== null) return direct;
    const total = Number(obj.totalMarks) || 0;
    if (total > 0 && typeof obj.passMarks === 'number' && !Number.isNaN(obj.passMarks)) {
        const derived = clampPct((obj.passMarks / total) * 100);
        if (derived !== null) return derived;
    }
    return 40;
}

/**
 * Compute percentage score from marks obtained and exam total.
 */
function scorePercentFromMarks(marks, totalMarks) {
    const total = Number(totalMarks) || 0;
    if (total <= 0) return 0;
    return Math.min(100, Math.max(0, ((Number(marks) || 0) / total) * 100));
}

function submissionPassed(marks, exam) {
    return scorePercentFromMarks(marks, exam.totalMarks) >= resolvePassPercentage(exam);
}

/**
 * Normalize create/update payload: store passPercentage only; strip legacy passMarks.
 * @param {object} body - req.body (mutated)
 * @param {number} totalMarks - exam total marks
 * @param {{ isCreate?: boolean }} opts - default pass when creating and no field sent
 */
function applyPassFieldsToExamPayload(body, totalMarks, opts = {}) {
    const { isCreate = false } = opts;
    const total = Number(totalMarks) || 0;
    const hasPct = typeof body.passPercentage === 'number' && !Number.isNaN(body.passPercentage);
    const hasLegacyMarks = typeof body.passMarks === 'number' && !Number.isNaN(body.passMarks);

    if (hasPct) {
        const c = clampPct(body.passPercentage);
        body.passPercentage = c !== null ? c : 40;
    } else if (hasLegacyMarks && total > 0) {
        const c = clampPct((body.passMarks / total) * 100);
        body.passPercentage = c !== null ? c : 40;
    } else if (isCreate && !hasPct && !hasLegacyMarks) {
        body.passPercentage = 40;
    }

    delete body.passMarks;
}

module.exports = {
    resolvePassPercentage,
    scorePercentFromMarks,
    submissionPassed,
    applyPassFieldsToExamPayload
};
