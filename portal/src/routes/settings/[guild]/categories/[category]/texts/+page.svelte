<script>
 import TextEditor from '$components/TextEditor.svelte';
 let { data } = $props();
</script>
{#key data.url}<TextEditor {data} />{/key}
