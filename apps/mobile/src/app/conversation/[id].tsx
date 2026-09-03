import { useEffect, useState } from 'react';
import { FlatList, KeyboardAvoidingView, Platform, StyleSheet, TextInput, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { ThemedView } from '@/components/themed-view';
import { ThemedText } from '@/components/themed-text';
import { PrimaryButton } from '@/components/primary-button';
import { useMessages } from '@/api/hooks';
import { useAuth } from '@/state/auth';
import { api } from '@/api/client';
import { useTheme } from '@/hooks/use-theme';

function ConversationScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const theme = useTheme();
  const qc = useQueryClient();
  const messages = useMessages(id);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (id) {
      api(`/conversations/${id}/read`, { method: 'POST', body: {} })
        .then(() => qc.invalidateQueries({ queryKey: ['conversations'] }))
        .catch(() => undefined);
    }
  }, [id, qc, messages.data?.items.length]);

  const send = async () => {
    const body = draft.trim();
    if (!body || !id) return;
    setSending(true);
    try {
      await api(`/conversations/${id}/messages`, { method: 'POST', body: { body } });
      setDraft('');
      await qc.invalidateQueries({ queryKey: ['messages', id] });
    } finally {
      setSending(false);
    }
  };

  // API returns newest-first; inverted list renders bottom-up chat style.
  return (
    <ThemedView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={90}
      >
        <FlatList
          inverted
          data={messages.data?.items ?? []}
          keyExtractor={(m) => m.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => {
            const mine = item.sender_user_id === user?.id;
            return (
              <View style={[styles.bubble, mine ? styles.mine : styles.theirs]}>
                <ThemedText type="small" style={mine ? styles.mineText : undefined}>
                  {item.body}
                </ThemedText>
              </View>
            );
          }}
        />
        <View style={styles.composer}>
          <TextInput
            accessibilityLabel="Message"
            style={[styles.input, { color: theme.text }]}
            placeholder="Write a message…"
            placeholderTextColor="#888"
            value={draft}
            onChangeText={setDraft}
            multiline
          />
          <PrimaryButton label="Send" onPress={send} loading={sending} disabled={!draft.trim()} />
        </View>
      </KeyboardAvoidingView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  list: { padding: 16, gap: 8 },
  bubble: { maxWidth: '80%', borderRadius: 14, padding: 10, marginBottom: 8 },
  mine: { alignSelf: 'flex-end', backgroundColor: '#3c87f7' },
  mineText: { color: '#fff' },
  theirs: { alignSelf: 'flex-start', backgroundColor: '#8883' },
  composer: { flexDirection: 'row', gap: 8, padding: 12, alignItems: 'flex-end' },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#8884',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    maxHeight: 120,
    fontSize: 16,
  },
});

/** Signed-in screen: wait for the session rather than render it with no user. */
export default function ConversationScreenRoute() {
  const { loading } = useAuth();
  if (loading) return null;
  return <ConversationScreen />;
}
