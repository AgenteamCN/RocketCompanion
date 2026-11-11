//! Zero-dependency SafeTensors binary container parser and IEEE-754 F16 -> F32 decoder for `rc_bot_ai`.

use std::collections::HashMap;

use crate::layout_and_specs::{BotPolicyId, MAX_BOT_POLICIES};

#[derive(Clone, Debug)]
pub enum SafeTensorData {
    F32(Vec<f32>),
    I32(Vec<i32>),
}

#[derive(Clone, Debug)]
pub struct SafeTensorEntry {
    pub shape: Vec<usize>,
    pub data: SafeTensorData,
}

impl SafeTensorEntry {
    #[inline]
    pub fn as_f32(&self) -> Option<&[f32]> {
        match &self.data {
            SafeTensorData::F32(v) => Some(v.as_slice()),
            SafeTensorData::I32(_) => None,
        }
    }

    #[inline]
    pub fn as_i32(&self) -> Option<&[i32]> {
        match &self.data {
            SafeTensorData::I32(v) => Some(v.as_slice()),
            SafeTensorData::F32(_) => None,
        }
    }
}

#[derive(Clone, Default)]
pub struct ParsedPolicyWeights {
    pub policy_id: BotPolicyId,
    pub tensors: HashMap<String, SafeTensorEntry>,
}

impl ParsedPolicyWeights {
    #[inline]
    pub fn f32_slice(&self, name: &str) -> Option<&[f32]> {
        self.tensors.get(name).and_then(SafeTensorEntry::as_f32)
    }

    #[inline]
    pub fn i32_slice(&self, name: &str) -> Option<&[i32]> {
        self.tensors.get(name).and_then(SafeTensorEntry::as_i32)
    }
}

pub struct BotWeightRegistry {
    pub models: [Option<ParsedPolicyWeights>; MAX_BOT_POLICIES],
    pub loaded_mask: u32,
}

impl Default for BotWeightRegistry {
    fn default() -> Self {
        Self::new()
    }
}

impl BotWeightRegistry {
    pub const fn new() -> Self {
        Self {
            models: [const { None }; MAX_BOT_POLICIES],
            loaded_mask: 1 << (BotPolicyId::Heuristic as u32),
        }
    }

    pub fn clear(&mut self) {
        self.models = [const { None }; MAX_BOT_POLICIES];
        self.loaded_mask = 1 << (BotPolicyId::Heuristic as u32);
    }

    pub fn is_policy_ready(&self, policy_id: BotPolicyId) -> bool {
        if policy_id == BotPolicyId::Heuristic {
            return true;
        }
        let slot = policy_id as usize;
        slot < MAX_BOT_POLICIES && self.models[slot].is_some()
    }

    pub fn get(&self, policy_id: BotPolicyId) -> Option<&ParsedPolicyWeights> {
        let slot = policy_id as usize;
        self.models.get(slot).and_then(Option::as_ref)
    }

    /// Parses a raw SafeTensors binary buffer (`[u64 header_len][JSON header][tensor payload]`)
    /// and stores the decoded `f32`/`i32` tensors in the slot for `policy_id`.
    /// Returns the number of loaded tensors on success, or a negative error code on failure.
    pub fn load_safetensors_bytes(&mut self, policy_id: BotPolicyId, bytes: &[u8]) -> i32 {
        let slot = policy_id as usize;
        if slot >= MAX_BOT_POLICIES {
            return -1;
        }
        let Some(parsed) = parse_safetensors_slice(policy_id, bytes) else {
            return -2;
        };
        let count = parsed.tensors.len() as i32;
        self.models[slot] = Some(parsed);
        self.loaded_mask |= 1 << (slot as u32);
        count
    }
}

#[inline]
pub fn decode_f16_to_f32(h: u16) -> f32 {
    let sign = ((h as u32) & 0x8000) << 16;
    let exp = ((h >> 10) & 0x1f) as i32;
    let mant = (h & 0x03ff) as u32;
    let bits = if exp == 0 {
        if mant == 0 {
            sign
        } else {
            let mut m = mant;
            let mut e = -14i32;
            while (m & 0x0400) == 0 {
                m <<= 1;
                e -= 1;
            }
            m &= 0x03ff;
            sign | (((e + 127) as u32) << 23) | (m << 13)
        }
    } else if exp == 31 {
        sign | 0x7f80_0000 | (mant << 13)
    } else {
        sign | (((exp - 15 + 127) as u32) << 23) | (mant << 13)
    };
    f32::from_bits(bits)
}

pub fn parse_safetensors_slice(
    policy_id: BotPolicyId,
    bytes: &[u8],
) -> Option<ParsedPolicyWeights> {
    if bytes.len() < 16 {
        return None;
    }
    let header_len_u64 = u64::from_le_bytes(bytes[0..8].try_into().ok()?);
    let header_len = usize::try_from(header_len_u64).ok()?;
    let data_base = 8usize.checked_add(header_len)?;
    if header_len == 0 || data_base > bytes.len() {
        return None;
    }
    let header_str = core::str::from_utf8(&bytes[8..data_base]).ok()?.trim();
    let payload = &bytes[data_base..];
    let tensors = parse_safetensors_header_and_payload(header_str, payload)?;
    Some(ParsedPolicyWeights { policy_id, tensors })
}

fn parse_safetensors_header_and_payload(
    header_json: &str,
    payload: &[u8],
) -> Option<HashMap<String, SafeTensorEntry>> {
    let mut map = HashMap::new();
    let bytes = header_json.as_bytes();
    let mut i = 0usize;

    while i < bytes.len() && bytes[i] != b'{' {
        i += 1;
    }
    i += 1;

    while i < bytes.len() {
        skip_ws_and_commas(bytes, &mut i);
        if i >= bytes.len() || bytes[i] == b'}' {
            break;
        }
        let key = parse_json_string(bytes, &mut i)?;
        skip_ws_and_colon(bytes, &mut i);
        let obj_start = i;
        let obj_end = skip_json_value(bytes, &mut i)?;
        if key == "__metadata__" {
            continue;
        }
        let obj_str = core::str::from_utf8(&bytes[obj_start..obj_end]).ok()?;
        let entry = decode_tensor_object(obj_str, payload)?;
        map.insert(key, entry);
    }

    Some(map)
}

fn decode_tensor_object(obj_str: &str, payload: &[u8]) -> Option<SafeTensorEntry> {
    let dtype = extract_string_field(obj_str, "\"dtype\"")?;
    let shape = extract_usize_array_field(obj_str, "\"shape\"")?;
    let offsets = extract_usize_array_field(obj_str, "\"data_offsets\"")?;
    if offsets.len() != 2 || offsets[0] > offsets[1] || offsets[1] > payload.len() {
        return None;
    }
    let raw = &payload[offsets[0]..offsets[1]];
    let data = match dtype.as_str() {
        "F32" => {
            if raw.len() % 4 != 0 {
                return None;
            }
            let mut vec = Vec::with_capacity(raw.len() / 4);
            for chunk in raw.chunks_exact(4) {
                vec.push(f32::from_le_bytes([chunk[0], chunk[1], chunk[2], chunk[3]]));
            }
            SafeTensorData::F32(vec)
        }
        "F16" => {
            if raw.len() % 2 != 0 {
                return None;
            }
            let mut vec = Vec::with_capacity(raw.len() / 2);
            for chunk in raw.chunks_exact(2) {
                let h = u16::from_le_bytes([chunk[0], chunk[1]]);
                vec.push(decode_f16_to_f32(h));
            }
            SafeTensorData::F32(vec)
        }
        "I32" => {
            if raw.len() % 4 != 0 {
                return None;
            }
            let mut vec = Vec::with_capacity(raw.len() / 4);
            for chunk in raw.chunks_exact(4) {
                vec.push(i32::from_le_bytes([chunk[0], chunk[1], chunk[2], chunk[3]]));
            }
            SafeTensorData::I32(vec)
        }
        "I64" => {
            if raw.len() % 8 != 0 {
                return None;
            }
            let mut vec = Vec::with_capacity(raw.len() / 8);
            for chunk in raw.chunks_exact(8) {
                let v = i64::from_le_bytes(chunk.try_into().ok()?);
                vec.push(v as i32);
            }
            SafeTensorData::I32(vec)
        }
        _ => return None,
    };

    Some(SafeTensorEntry { shape, data })
}

fn skip_ws_and_commas(b: &[u8], i: &mut usize) {
    while *i < b.len() && (b[*i].is_ascii_whitespace() || b[*i] == b',') {
        *i += 1;
    }
}

fn skip_ws_and_colon(b: &[u8], i: &mut usize) {
    while *i < b.len() && (b[*i].is_ascii_whitespace() || b[*i] == b':') {
        *i += 1;
    }
}

fn parse_json_string(b: &[u8], i: &mut usize) -> Option<String> {
    while *i < b.len() && b[*i].is_ascii_whitespace() {
        *i += 1;
    }
    if *i >= b.len() || b[*i] != b'"' {
        return None;
    }
    *i += 1;
    let start = *i;
    while *i < b.len() {
        if b[*i] == b'\\' {
            *i += 2;
            continue;
        }
        if b[*i] == b'"' {
            let s = core::str::from_utf8(&b[start..*i]).ok()?.to_string();
            *i += 1;
            return Some(s);
        }
        *i += 1;
    }
    None
}

fn skip_json_value(b: &[u8], i: &mut usize) -> Option<usize> {
    while *i < b.len() && b[*i].is_ascii_whitespace() {
        *i += 1;
    }
    if *i >= b.len() {
        return None;
    }
    let ch = b[*i];
    if ch == b'{' || ch == b'[' {
        let open = ch;
        let close = if open == b'{' { b'}' } else { b']' };
        let mut depth = 0usize;
        let mut in_str = false;
        while *i < b.len() {
            let c = b[*i];
            if in_str {
                if c == b'\\' {
                    *i += 2;
                    continue;
                }
                if c == b'"' {
                    in_str = false;
                }
            } else if c == b'"' {
                in_str = true;
            } else if c == open {
                depth += 1;
            } else if c == close {
                depth -= 1;
                if depth == 0 {
                    *i += 1;
                    return Some(*i);
                }
            }
            *i += 1;
        }
        None
    } else if ch == b'"' {
        let _ = parse_json_string(b, i)?;
        Some(*i)
    } else {
        while *i < b.len() && b[*i] != b',' && b[*i] != b'}' && b[*i] != b']' {
            *i += 1;
        }
        Some(*i)
    }
}

fn extract_string_field(obj_str: &str, key: &str) -> Option<String> {
    let pos = obj_str.find(key)?;
    let bytes = obj_str.as_bytes();
    let mut i = pos + key.len();
    skip_ws_and_colon(bytes, &mut i);
    parse_json_string(bytes, &mut i)
}

fn extract_usize_array_field(obj_str: &str, key: &str) -> Option<Vec<usize>> {
    let pos = obj_str.find(key)?;
    let rest = &obj_str[pos + key.len()..];
    let open = rest.find('[')?;
    let close = rest[open..].find(']')? + open;
    let inner = rest[open + 1..close].trim();
    if inner.is_empty() {
        return Some(Vec::new());
    }
    let mut out = Vec::new();
    for part in inner.split(',') {
        let v = part.trim().parse::<usize>().ok()?;
        out.push(v);
    }
    Some(out)
}
