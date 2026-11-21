// csv-reader-speed: a fast drop-in for csv-reader 1.0.0 (make.fun).
//
// run(input) returns, for {text, header}, exactly the answer csv-reader
// 1.0.0 returns: {columns, rows, errors}. Written from the competition
// RULES text, in my own code: a U+FEFF at the very start is dropped; a
// record ends at LF or CRLF and a line left with no characters is no
// record; outside quotes a CR not followed by LF is dropped (stray_cr); a
// field opening with a quote runs to the next undoubled quote, "" inside
// it is one quote and each CRLF or lone CR inside it reads as LF, what
// follows its closing quote up to the next comma or line break is appended
// as it stands (quote_junk, when the field ends), and a quote that never
// closes is a literal character with the text after it read again as
// unquoted (unterminated_quote); a quote inside an unquoted field is
// literal; fields stay strings, never trimmed or converted; columns is the
// first record when header is true, else null; rows holds the records
// after it, each padded with "" (short_row, with fields: its count) or cut
// (long_row, with extra: the cut fields) to the first record's width; each
// error is {code, line, row} in the order met, line the 1-based line its
// record starts on, row its index in rows (null for the header).
//
// Speed: most records hold no quote and no stray CR, so they take a fast
// path — one native indexOf to find the line end, one slice, and a native
// split(',') — instead of a character loop. Anything with a quote or a
// stray CR takes a slow path that scans field by field, slicing each
// field out whole instead of building it character by character. Peak
// memory is not scored, only CPU time.

const COMMA = 0;
const BREAK = 1;
const END = 2;

/** csv-reader 1.0.0's answer for one case's input. */
export function run(input) {
  const text = String(input.text);
  const header = input.header === true;
  const n = text.length;
  const errors = [];
  const rows = [];
  let columns = null;
  let width = -1;

  let pos = 0; // the next character to read
  let line = 1; // the line that character is on
  if (n > 0 && text.charCodeAt(0) === 0xfeff) pos = 1;

  // The record being read: the line it starts on and the index in rows it takes (null: the header).
  let recordLine = 1;
  let recordRow = null;

  // Reads unquoted characters from pos up to the next comma or line break: a CR not followed by LF is dropped
  // (stray_cr). `init` is the field's starting value ('' normally, the literal opening quote after an
  // unterminated quote, or a quoted field's value before its junk). Returns the field, how it ended, and how
  // many characters the scan itself kept (`added`, for the quote_junk check).
  function readUnquoted(init) {
    let value = init;
    let added = 0;
    let segStart = pos;
    for (;;) {
      let i = pos;
      while (i < n) {
        const c = text.charCodeAt(i);
        if (c === 44 || c === 10 || c === 13) break;
        i++;
      }
      if (i >= n) {
        if (i > segStart) {
          value += text.slice(segStart, i);
          added += i - segStart;
        }
        pos = i;
        return { value, ended: END, added };
      }
      const c = text.charCodeAt(i);
      if (c === 44) {
        if (i > segStart) {
          value += text.slice(segStart, i);
          added += i - segStart;
        }
        pos = i + 1;
        return { value, ended: COMMA, added };
      }
      if (c === 10) {
        if (i > segStart) {
          value += text.slice(segStart, i);
          added += i - segStart;
        }
        pos = i + 1;
        line++;
        return { value, ended: BREAK, added };
      }
      // c === 13
      if (text.charCodeAt(i + 1) === 10) {
        if (i > segStart) {
          value += text.slice(segStart, i);
          added += i - segStart;
        }
        pos = i + 2;
        line++;
        return { value, ended: BREAK, added };
      }
      // A lone CR: dropped, stray_cr, and the field goes on after it.
      errors.push({ code: 'stray_cr', line: recordLine, row: recordRow });
      if (i > segStart) {
        value += text.slice(segStart, i);
        added += i - segStart;
      }
      pos = i + 1;
      segStart = pos;
    }
  }

  // Reads a quoted field whose opening quote is at pos.
  function readQuoted() {
    const open = pos;
    const openLine = line;
    pos += 1;
    let value = '';
    for (;;) {
      const q = text.indexOf('"', pos);
      if (q === -1) {
        // The quote never closes: it is a literal character, and the text after it is read again as unquoted.
        pos = open + 1;
        line = openLine;
        errors.push({ code: 'unterminated_quote', line: recordLine, row: recordRow });
        return readUnquoted('"');
      }
      let seg = text.slice(pos, q);
      if (seg.indexOf('\n') !== -1 || seg.indexOf('\r') !== -1) {
        // Each LF and each lone CR inside quotes is one more line; CRLF is one.
        let cnt = 0;
        let idx = -1;
        while ((idx = seg.indexOf('\n', idx + 1)) !== -1) cnt++;
        idx = -1;
        while ((idx = seg.indexOf('\r', idx + 1)) !== -1) {
          if (seg.charCodeAt(idx + 1) !== 10) cnt++;
        }
        line += cnt;
        // CRLF and a lone CR inside quotes are each one LF.
        if (seg.indexOf('\r') !== -1) seg = seg.replace(/\r\n?/g, '\n');
      }
      value += seg;
      if (text.charCodeAt(q + 1) === 34) {
        // A doubled quote is one quote inside the field.
        value += '"';
        pos = q + 2;
        continue;
      }
      pos = q + 1;
      if (pos >= n) return { value, ended: END };
      const c = text.charCodeAt(pos);
      if (c === 44) {
        pos += 1;
        return { value, ended: COMMA };
      }
      if (c === 10) {
        pos += 1;
        line += 1;
        return { value, ended: BREAK };
      }
      if (c === 13 && text.charCodeAt(pos + 1) === 10) {
        pos += 2;
        line += 1;
        return { value, ended: BREAK };
      }
      // What follows the closing quote is appended as it stands, up to the next comma or line break.
      const junk = readUnquoted(value);
      if (junk.added > 0) errors.push({ code: 'quote_junk', line: recordLine, row: recordRow });
      return junk;
    }
  }

  // A field cut out whole: a CR just before its LF is the CRLF ending, any other CR in it is a stray CR
  // (one error each, dropped from the value).
  function cleanField(field, ended) {
    if (ended === BREAK && field.charCodeAt(field.length - 1) === 13) field = field.slice(0, -1);
    if (field.indexOf('\r') !== -1) {
      let count = 0;
      let idx = -1;
      while ((idx = field.indexOf('\r', idx + 1)) !== -1) count++;
      for (let k = 0; k < count; k++) {
        errors.push({ code: 'stray_cr', line: recordLine, row: recordRow });
      }
      field = field.replace(/\r/g, '');
    }
    return field;
  }

  // Reads one record, field by field, from pos (the slow path: the record holds a quote or a stray CR).
  // Returns its fields and whether its last field was quoted. An unquoted field ends at the next comma or
  // LF: the comma is found first (a few characters away), and only that short slice is then checked for a
  // LF before it, instead of scanning to the end of the record for every field.
  function readRecordSlow() {
    const fields = [];
    let quoted = false;
    let ended = COMMA;
    while (ended === COMMA) {
      quoted = text.charCodeAt(pos) === 34;
      if (quoted) {
        const field = readQuoted();
        fields.push(field.value);
        ended = field.ended;
        continue;
      }
      const cIdx = text.indexOf(',', pos);
      let field;
      if (cIdx !== -1) {
        const seg = text.slice(pos, cIdx);
        const nIn = seg.indexOf('\n');
        if (nIn === -1) {
          field = cleanField(seg, COMMA);
          ended = COMMA;
          pos = cIdx + 1;
        } else {
          field = cleanField(seg.slice(0, nIn), BREAK);
          ended = BREAK;
          pos = pos + nIn + 1;
          line++;
        }
      } else {
        const nIdx = text.indexOf('\n', pos);
        if (nIdx === -1) {
          field = cleanField(text.slice(pos), END);
          ended = END;
          pos = n;
        } else {
          field = cleanField(text.slice(pos, nIdx), BREAK);
          ended = BREAK;
          pos = nIdx + 1;
          line++;
        }
      }
      fields.push(field);
    }
    return { fields, quoted };
  }

  // Files a finished record: the header, or a row padded or cut to the first record's width.
  function commit(fields) {
    if (width < 0) width = fields.length;
    if (header && columns === null) {
      columns = fields;
      return;
    }
    if (fields.length < width) {
      errors.push({ code: 'short_row', line: recordLine, row: recordRow, fields: fields.length });
      while (fields.length < width) fields.push('');
    } else if (fields.length > width) {
      errors.push({ code: 'long_row', line: recordLine, row: recordRow, extra: fields.splice(width) });
    }
    rows.push(fields);
  }

  while (pos < n) {
    recordLine = line;
    recordRow = header && columns === null ? null : rows.length;

    // Fast path: the record ends at the next LF and holds no quote and no stray CR. A trailing CR before
    // that LF is the CRLF ending, not a stray one; a trailing CR with no LF after it is stray, so it is
    // not fast. The slice is a view, not a copy, and split(',') runs natively.
    const nl = text.indexOf('\n', pos);
    const end = nl === -1 ? n : nl;
    const seg = text.slice(pos, end);
    if (seg.indexOf('"') === -1) {
      const ri = seg.indexOf('\r');
      if (ri === -1 || (nl !== -1 && ri === seg.length - 1)) {
        const s = ri === -1 ? seg : seg.slice(0, -1);
        pos = nl === -1 ? n : nl + 1;
        line++;
        // A line left with no characters is no record.
        if (s !== '') commit(s.split(','));
        continue;
      }
    }

    // Slow path: a quote or a stray CR is in the way.
    const rec = readRecordSlow();
    // A line that held only stray CRs is left with no characters: no record (its stray_cr errors stay).
    if (rec.fields.length === 1 && rec.fields[0] === '' && !rec.quoted) continue;
    commit(rec.fields);
  }
  return { columns: header ? (columns ?? []) : null, rows, errors };
}
